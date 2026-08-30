mod inference;
mod model_manager;

use inference::{
    EmbeddingState, GenerateReplyRequest, GenerateReplyResponse, InferenceState, InterpretRequest,
    InterpretResponse,
};
use serde::Serialize;
use std::sync::Mutex as StandardMutex;
use sysinfo::System;
use tauri::{AppHandle, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalAiStatus {
    available: bool,
    runtime: &'static str,
    state: &'static str,
    model_id: Option<String>,
    model_label: Option<String>,
    model_version: Option<String>,
    quantization: Option<String>,
    installed_bytes: Option<u64>,
    embedding_installed_bytes: Option<u64>,
    embedding_model_id: Option<String>,
    embedding_model_label: Option<String>,
    model_directory: String,
    recommended_model_id: String,
    available_models: Vec<LocalModelOption>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalModelOption {
    id: String,
    label: String,
    role: String,
    size_bytes: u64,
    minimum_memory_bytes: u64,
    installed: bool,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelDownloadProgress {
    model_id: String,
    received_bytes: u64,
    total_bytes: u64,
    active: bool,
}

#[derive(Default)]
struct ModelDownloadState(StandardMutex<ModelDownloadProgress>);

async fn status(app: &AppHandle) -> Result<LocalAiStatus, String> {
    let total_memory = System::new_all().total_memory();
    let recommended = if total_memory >= 16 * 1024 * 1024 * 1024 {
        "ministral-3-8b-q4"
    } else {
        "ministral-3-3b-q4"
    };
    let installed = model_manager::installed_entry(app).await?;
    let embedding = model_manager::installed_for_role(app, &["embedding"]).await?;
    let installed_ids = model_manager::installed_ids(app).await?;
    let available_models = model_manager::manifest()?
        .into_iter()
        .filter(|model| model.enabled)
        .map(|model| LocalModelOption {
            installed: installed_ids.contains(&model.id),
            id: model.id,
            label: model.label,
            role: model.role,
            size_bytes: model.size_bytes,
            minimum_memory_bytes: model.minimum_memory_bytes,
        })
        .collect();
    Ok(LocalAiStatus {
        available: installed.is_some(),
        runtime: "tauri",
        state: if installed.is_some() {
            "ready"
        } else {
            "model_missing"
        },
        model_id: installed.as_ref().map(|value| value.id.clone()),
        model_label: installed.as_ref().map(|value| value.label.clone()),
        model_version: installed.as_ref().map(|value| value.version.clone()),
        quantization: installed.as_ref().map(|value| value.quantization.clone()),
        installed_bytes: installed.as_ref().map(|value| value.size_bytes),
        recommended_model_id: recommended.into(),
        available_models,
        embedding_installed_bytes: embedding.as_ref().map(|value| value.size_bytes),
        embedding_model_id: embedding.as_ref().map(|value| value.id.clone()),
        embedding_model_label: embedding.as_ref().map(|value| value.label.clone()),
        model_directory: model_manager::model_dir(app)?
            .to_string_lossy()
            .into_owned(),
        message: if installed.is_some() {
            "Local interpretation is ready. Provider actions still require backend policy and approval.".into()
        } else {
            "Choose a checksummed model to enable device-local interpretation.".into()
        },
    })
}

#[tauri::command]
async fn local_ai_status(app: AppHandle) -> Result<LocalAiStatus, String> {
    status(&app).await
}

#[tauri::command]
async fn install_local_model(
    app: AppHandle,
    download: State<'_, ModelDownloadState>,
    model_id: String,
) -> Result<LocalAiStatus, String> {
    {
        let mut current = download
            .0
            .lock()
            .map_err(|_| "Model download state is unavailable.".to_string())?;
        *current = ModelDownloadProgress {
            model_id: model_id.clone(),
            received_bytes: 0,
            total_bytes: 0,
            active: true,
        };
    }
    let result = model_manager::install(&app, &model_id, |received_bytes, total_bytes| {
        if let Ok(mut current) = download.0.lock() {
            *current = ModelDownloadProgress {
                model_id: model_id.clone(),
                received_bytes,
                total_bytes,
                active: true,
            };
        }
    })
    .await;
    if let Ok(mut current) = download.0.lock() {
        current.active = false;
    }
    result?;
    if model_id != "nomic-embed-v2-moe-q4" {
        model_manager::select(&app, &model_id).await?;
    }
    status(&app).await
}

#[tauri::command]
async fn select_local_model(
    app: AppHandle,
    state: State<'_, InferenceState>,
    model_id: String,
) -> Result<LocalAiStatus, String> {
    if let Some(mut running) = state.0.lock().await.take() {
        let _ = running.child.kill().await;
    }
    model_manager::select(&app, &model_id).await?;
    status(&app).await
}

#[tauri::command]
fn local_ai_download_progress(
    download: State<'_, ModelDownloadState>,
) -> Result<ModelDownloadProgress, String> {
    download
        .0
        .lock()
        .map(|value| value.clone())
        .map_err(|_| "Model download state is unavailable.".to_string())
}

#[tauri::command]
async fn open_local_model_folder(app: AppHandle) -> Result<(), String> {
    let directory = model_manager::model_dir(&app)?;
    tokio::fs::create_dir_all(&directory)
        .await
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer.exe")
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("Could not open the model folder: {error}"))?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("Could not open the model folder: {error}"))?;
    #[cfg(all(unix, not(target_os = "macos")))]
    std::process::Command::new("xdg-open")
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("Could not open the model folder: {error}"))?;
    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let parsed =
        reqwest::Url::parse(&url).map_err(|_| "The connection URL is invalid.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Only secure HTTPS connection pages can be opened.".into());
    }
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer.exe")
        .arg(url)
        .spawn()
        .map_err(|error| format!("Could not open the browser: {error}"))?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|error| format!("Could not open the browser: {error}"))?;
    #[cfg(all(unix, not(target_os = "macos")))]
    std::process::Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map_err(|error| format!("Could not open the browser: {error}"))?;
    Ok(())
}

#[tauri::command]
async fn remove_local_model(
    app: AppHandle,
    state: State<'_, InferenceState>,
    embedding_state: State<'_, EmbeddingState>,
    model_id: String,
) -> Result<LocalAiStatus, String> {
    if let Some(mut running) = state.0.lock().await.take() {
        let _ = running.child.kill().await;
    }
    if let Some(mut running) = embedding_state.0.lock().await.take() {
        let _ = running.child.kill().await;
    }
    model_manager::remove(&app, &model_id).await?;
    status(&app).await
}

#[tauri::command]
async fn interpret_agent_prompt(
    app: AppHandle,
    state: State<'_, InferenceState>,
    request: InterpretRequest,
) -> Result<InterpretResponse, String> {
    inference::interpret(&app, &state, request).await
}

#[tauri::command]
async fn generate_local_reply(
    app: AppHandle,
    state: State<'_, InferenceState>,
    request: GenerateReplyRequest,
) -> Result<GenerateReplyResponse, String> {
    inference::generate_reply(&app, &state, request).await
}

#[tauri::command]
async fn embed_text_locally(
    app: AppHandle,
    state: State<'_, EmbeddingState>,
    text: String,
) -> Result<inference::EmbedResponse, String> {
    inference::embed(&app, &state, text).await
}

#[tauri::command]
async fn test_local_model(
    app: AppHandle,
    state: State<'_, InferenceState>,
) -> Result<serde_json::Value, String> {
    let started = std::time::Instant::now();
    let request = InterpretRequest {
        prompt: "Search my appointments. Do not book anything.".into(),
        tools: vec!["appointments.search".into()],
        capabilities: vec!["appointments.availability.search".into()],
        high_risk_actions: vec!["appointments.reserve".into()],
    };
    inference::interpret(&app, &state, request).await?;
    Ok(
        serde_json::json!({"ok":true,"latencyMs":started.elapsed().as_millis(),"message":"Local model returned a valid interpretation."}),
    )
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
        .plugin(tauri_plugin_deep_link::init())
        .manage(InferenceState(tokio::sync::Mutex::new(None)))
        .manage(EmbeddingState(tokio::sync::Mutex::new(None)))
        .manage(ModelDownloadState::default())
        .invoke_handler(tauri::generate_handler![
            local_ai_status,
            local_ai_download_progress,
            install_local_model,
            select_local_model,
            remove_local_model,
            open_local_model_folder,
            open_external_url,
            interpret_agent_prompt,
            generate_local_reply,
            embed_text_locally,
            test_local_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running AI Agent Hub desktop");
}
