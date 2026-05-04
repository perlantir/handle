import type {
  CriticReviewEvent,
  SSEEvent,
  StatusUpdateEvent,
  TaskStatus,
} from "@handle/shared";

export function normalizeStoredObservabilityEvents(
  value: unknown,
  taskId: string,
) {
  if (!Array.isArray(value)) return [];

  return value.filter((event): event is SSEEvent => {
    return (
      typeof event === "object" &&
      event !== null &&
      "taskId" in event &&
      event.taskId === taskId &&
      "type" in event &&
      typeof event.type === "string"
    );
  });
}

export function normalizeCriticReviewEvents(value: unknown, taskId: string) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((review): CriticReviewEvent[] => {
    if (
      typeof review !== "object" ||
      review === null ||
      !("id" in review) ||
      typeof review.id !== "string" ||
      !("interventionPoint" in review) ||
      typeof review.interventionPoint !== "string" ||
      !("verdict" in review) ||
      typeof review.verdict !== "string" ||
      !["APPROVE", "REVISE", "REJECT"].includes(review.verdict) ||
      !("reasoning" in review) ||
      typeof review.reasoning !== "string"
    ) {
      return [];
    }

    const metadata =
      "metadata" in review &&
      typeof review.metadata === "object" &&
      review.metadata !== null
        ? (review.metadata as Record<string, unknown>)
        : undefined;
    const createdAt =
      "createdAt" in review && review.createdAt instanceof Date
        ? review.createdAt.toISOString()
        : "createdAt" in review && typeof review.createdAt === "string"
          ? review.createdAt
          : new Date(0).toISOString();

    return [
      {
        createdAt,
        id: review.id,
        interventionPoint: review.interventionPoint,
        ...(metadata ? { metadata } : {}),
        reasoning: review.reasoning,
        taskId,
        type: "critic_review",
        verdict: review.verdict as CriticReviewEvent["verdict"],
      },
    ];
  });
}

export function replayEventsForRun({
  criticReviews,
  includeStatus = false,
  status,
  taskId,
  toolCalls,
}: {
  criticReviews: unknown;
  includeStatus?: boolean;
  status?: TaskStatus;
  taskId: string;
  toolCalls: unknown;
}) {
  const storedEvents = normalizeStoredObservabilityEvents(toolCalls, taskId);
  const storedCriticReviewIds = new Set(
    storedEvents.flatMap((event) =>
      event.type === "critic_review" ? [event.id] : [],
    ),
  );
  const criticEvents = normalizeCriticReviewEvents(criticReviews, taskId).filter(
    (event) => !storedCriticReviewIds.has(event.id),
  );
  const events: SSEEvent[] = [...storedEvents, ...criticEvents];

  if (includeStatus && status) {
    const statusEvent: StatusUpdateEvent = {
      status,
      taskId,
      type: "status_update",
    };
    events.push(statusEvent);
  }

  return events;
}
