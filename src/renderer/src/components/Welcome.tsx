import { FolderOpen, Settings } from "lucide-react";
import type { RecentFolder } from "../../../shared/types";

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
        <button className="welcome-settings" onClick={onOpenSettings}>
          <Settings /> Settings
        </button>
        <button
          className="primary-action welcome-action"
          onClick={onOpenFolder}
        >
          <FolderOpen /> Open folder
        </button>
        <div className="recent-block">
          <span>Recent folders</span>
          {recent.length ? (
            recent.map((folder) => (
              <button
                className="recent-row"
                key={folder.root}
                onClick={() => onOpenRecent(folder)}
              >
                <strong>{folder.name}</strong>
                <small>{folder.root}</small>
              </button>
            ))
          ) : (
            <p>No recent folders</p>
          )}
        </div>
      </section>
    </main>
  );
}
