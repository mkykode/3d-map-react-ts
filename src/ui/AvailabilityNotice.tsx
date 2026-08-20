import type { EvidenceAvailability } from "../domain/evidence";
import { describeAvailability } from "../evidence/availability";

export function AvailabilityNotice({
  availability,
  showAvailable = false,
}: {
  availability: EvidenceAvailability;
  showAvailable?: boolean;
}) {
  const description = describeAvailability(availability);
  const showContent = !description.available || showAvailable;

  return (
    <section
      className={`availability-notice availability-${description.severity}`}
      role="status"
      aria-live={description.severity === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      aria-relevant="additions text"
    >
      {showContent ? (
        <>
          <strong>{description.title}</strong>
          <p>{description.detail}</p>
        </>
      ) : null}
    </section>
  );
}
