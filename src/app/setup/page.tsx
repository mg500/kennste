import { MusicSetup } from "@/components/MusicSetup";
import { isModeId } from "@/lib/game/modes";

export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  const { mode } = await searchParams;
  return <MusicSetup mode={isModeId(mode) ? mode : "buzzer"} />;
}
