import { FolderOpen, Settings } from "lucide-react";
import type { RecentFolder } from "../../../shared/types";
import { AppButton } from "./AppButton";

type WelcomeProps = {
  recent: RecentFolder[];
  onOpenFolder: () => void;
  onOpenRecent: (folder: RecentFolder) => void;
  onOpenSettings: () => void;
};

export function Welcome({
  recent,
  onOpenFolder,
  onOpenRecent,
  onOpenSettings,
}: WelcomeProps) {
  return (
    <main className="app-shell welcome-shell">
      <section className="welcome">
        <AppButton className="welcome-settings" onClick={onOpenSettings}>
          <Settings /> Settings
        </AppButton>
        <AppButton
          className="primary-action welcome-action"
          onClick={onOpenFolder}
        >
          <FolderOpen /> Open folder
        </AppButton>
        <div className="recent-block">
          <span>Recent folders</span>
          {recent.length ? (
            recent.map((folder) => (
              <AppButton
                className="recent-row"
                key={folder.root}
                onClick={() => onOpenRecent(folder)}
              >
                <strong>{folder.name}</strong>
                <small>{folder.root}</small>
              </AppButton>
            ))
          ) : (
            <p>No recent folders</p>
          )}
        </div>
      </section>
    </main>
  );
}
