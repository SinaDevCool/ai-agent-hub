use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::{fs, io::AsyncWriteExt};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub id: String,
    pub label: String,
    pub version: String,
    pub quantization: String,
    pub role: String,
    pub license: String,
    pub source: String,
    pub download_url: String,
    pub file_name: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub minimum_memory_bytes: u64,
    pub recommended_memory_bytes: u64,
    pub enabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    models: Vec<ModelEntry>,
    #[serde(default)]
    evaluation_only: Vec<EvaluationModelEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationModelEntry {
    pub id: String,
    pub reason: String,
}

pub fn manifest() -> Result<Vec<ModelEntry>, String> {
    let raw = include_str!("../../model-manifest.json");
    serde_json::from_str::<Manifest>(raw)
        .map(|value| value.models)
        .map_err(|error| error.to_string())
}

pub fn evaluation_models() -> Result<Vec<EvaluationModelEntry>, String> {
    let raw = include_str!("../../model-manifest.json");
    serde_json::from_str::<Manifest>(raw)
        .map(|value| value.evaluation_only)
        .map_err(|error| error.to_string())
}

pub fn entry(model_id: &str) -> Result<ModelEntry, String> {
    manifest()?
        .into_iter()
        .find(|model| model.id == model_id && model.enabled)
        .ok_or_else(|| "That model is not in the signed application allowlist.".to_string())
}

pub fn model_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("models"))
        .map_err(|error| error.to_string())
}

pub fn model_path(app: &AppHandle, model: &ModelEntry) -> Result<PathBuf, String> {
    Ok(model_dir(app)?.join(&model.file_name))
}

pub async fn installed_entry(app: &AppHandle) -> Result<Option<ModelEntry>, String> {
    let selected_path = model_dir(app)?.join("active-language-model");
    if let Ok(selected_id) = fs::read_to_string(&selected_path).await {
        if let Ok(selected) = entry(selected_id.trim()) {
            if ["default", "quality"].contains(&selected.role.as_str())
                && is_installed(app, &selected).await?
            {
                return Ok(Some(selected));
            }
        }
    }
    installed_for_role(app, &["default", "quality"]).await
}

pub async fn installed_for_agent(
    app: &AppHandle,
    prefer_quality: bool,
) -> Result<Option<ModelEntry>, String> {
    if prefer_quality {
        if let Some(model) = installed_for_role(app, &["quality"]).await? {
            return Ok(Some(model));
        }
    } else if let Some(model) = installed_for_role(app, &["default"]).await? {
        return Ok(Some(model));
    }
    installed_entry(app).await
}

async fn is_installed(app: &AppHandle, model: &ModelEntry) -> Result<bool, String> {
    let path = model_path(app, model)?;
    Ok(fs::try_exists(&path)
        .await
        .map_err(|error| error.to_string())?
        && fs::metadata(path)
            .await
            .map_err(|error| error.to_string())?
            .len()
            == model.size_bytes)
}

pub async fn select(app: &AppHandle, model_id: &str) -> Result<ModelEntry, String> {
    let model = entry(model_id)?;
    if !["default", "quality"].contains(&model.role.as_str()) {
        return Err("Only language models can be selected for agent interpretation.".into());
    }
    if !is_installed(app, &model).await? {
        return Err("Download this model before selecting it.".into());
    }
    let directory = model_dir(app)?;
    fs::create_dir_all(&directory)
        .await
        .map_err(|error| error.to_string())?;
    fs::write(directory.join("active-language-model"), &model.id)
        .await
        .map_err(|error| error.to_string())?;
    Ok(model)
}

pub async fn installed_ids(app: &AppHandle) -> Result<Vec<String>, String> {
    let mut result = Vec::new();
    for model in manifest()? {
        if is_installed(app, &model).await? {
            result.push(model.id);
        }
    }
    Ok(result)
}

pub async fn installed_for_role(
    app: &AppHandle,
    roles: &[&str],
) -> Result<Option<ModelEntry>, String> {
    for model in manifest()?
        .into_iter()
        .filter(|model| roles.contains(&model.role.as_str()))
    {
        let path = model_path(app, &model)?;
        if fs::try_exists(&path)
            .await
            .map_err(|error| error.to_string())?
        {
            // Downloads are checksum-verified before the atomic rename below.
            // Re-hashing multi-gigabyte weights on every settings refresh made
            // the desktop UI appear frozen for up to a minute. A changed size
            // is still rejected here; Test model performs the runtime check.
            if fs::metadata(&path)
                .await
                .map_err(|error| error.to_string())?
                .len()
                == model.size_bytes
            {
                return Ok(Some(model));
            }
            let _ = fs::remove_file(path).await;
        }
    }
    Ok(None)
}

pub async fn install<F>(
    app: &AppHandle,
    model_id: &str,
    mut report_progress: F,
) -> Result<ModelEntry, String>
where
    F: FnMut(u64, u64),
{
    let model = entry(model_id)?;
    let directory = model_dir(app)?;
    fs::create_dir_all(&directory)
        .await
        .map_err(|error| error.to_string())?;
    let target = model_path(app, &model)?;
    if fs::try_exists(&target)
        .await
        .map_err(|error| error.to_string())?
        && fs::metadata(&target)
            .await
            .map_err(|error| error.to_string())?
            .len()
            == model.size_bytes
    {
        report_progress(model.size_bytes, model.size_bytes);
        return Ok(model);
    }
    let partial = target.with_extension("download");
    let response = reqwest::Client::new()
        .get(&model.download_url)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Model host returned HTTP {}.", response.status()));
    }
    let mut file = fs::File::create(&partial)
        .await
        .map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut received = 0_u64;
    report_progress(0, model.size_bytes);
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        received += chunk.len() as u64;
        if received > model.size_bytes + 1024 {
            let _ = fs::remove_file(&partial).await;
            return Err("Model download exceeded its signed size.".into());
        }
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|error| error.to_string())?;
        report_progress(received, model.size_bytes);
    }
    file.flush().await.map_err(|error| error.to_string())?;
    if received != model.size_bytes || hex::encode(hasher.finalize()) != model.sha256 {
        let _ = fs::remove_file(&partial).await;
        return Err("Model checksum or size did not match the signed manifest.".into());
    }
    fs::rename(&partial, &target)
        .await
        .map_err(|error| error.to_string())?;
    if ["default", "quality"].contains(&model.role.as_str()) {
        select(app, &model.id).await?;
    }
    Ok(model)
}

pub async fn remove(app: &AppHandle, model_id: &str) -> Result<(), String> {
    let model = entry(model_id)?;
    let path = model_path(app, &model)?;
    if fs::try_exists(&path)
        .await
        .map_err(|error| error.to_string())?
    {
        fs::remove_file(path)
            .await
            .map_err(|error| error.to_string())?;
    }
    let selected_path = model_dir(app)?.join("active-language-model");
    if fs::read_to_string(&selected_path)
        .await
        .map(|value| value.trim() == model_id)
        .unwrap_or(false)
    {
        let _ = fs::remove_file(selected_path).await;
    }
    Ok(())
}
