import Link from "next/link";
import { JoinCodeForm } from "@/components/JoinCodeForm";
import { Screen } from "@/components/game/shared";

export default function JoinPage() {
  return (
    <Screen decor="corner">
      <Link href="/" className="self-start py-2 text-muted hover:text-text">← Start</Link>
      <div className="flex flex-1 flex-col justify-center">
        <div className="rounded-card bg-surface p-5">
          <JoinCodeForm autoFocus />
        </div>
      </div>
    </Screen>
  );
}
