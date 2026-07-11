import { Save, UserRound } from "lucide-react";
import type { FormEvent } from "react";
import type { CreatorProfile } from "../../api/types";

type CreatorProfileEditorProps = {
  bio: string;
  displayName: string;
  isSaving: boolean;
  onBioChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  profile: CreatorProfile | null;
};

export function CreatorProfileEditor(props: CreatorProfileEditorProps) {
  return (
    <form className="creator-profile-card" data-testid="creator-profile-form" onSubmit={(event) => void props.onSubmit(event)}>
      <div>
        <strong><UserRound size={16} /> Creator profile</strong>
        <span>{props.profile?.verified ? "Verified creator" : "Community creator"}</span>
      </div>
      <label>
        <span>Public name</span>
        <input
          autoComplete="organization"
          maxLength={80}
          minLength={2}
          name="creator-display-name"
          onChange={(event) => props.onDisplayNameChange(event.currentTarget.value)}
          placeholder="Your creator name"
          required
          value={props.displayName}
        />
      </label>
      <label>
        <span>Short bio</span>
        <input
          autoComplete="off"
          maxLength={500}
          name="creator-bio"
          onChange={(event) => props.onBioChange(event.currentTarget.value)}
          placeholder="What kind of agents do you build?"
          value={props.bio}
        />
      </label>
      <button data-testid="creator-save-profile" disabled={props.isSaving} type="submit"><Save size={15} /> Save profile</button>
    </form>
  );
}
