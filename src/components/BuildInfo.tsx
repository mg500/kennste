import { REPO_URL, VERSION_LABEL } from "@/lib/version";

function GitHubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

/** Version and a link to the source code: in the start page's footer and at the bottom of the host menu. */
export function BuildInfo({ className = "" }: { className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted lg:text-sm ${className}`}>
      <span>Kennste?! {VERSION_LABEL}</span>
      <span aria-hidden>·</span>
      <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-text">
        <GitHubIcon />Quellcode auf GitHub
      </a>
      <span aria-hidden className="hidden lg:inline">·</span>
      <span className="hidden lg:inline">MIT-Lizenz</span>
    </p>
  );
}
