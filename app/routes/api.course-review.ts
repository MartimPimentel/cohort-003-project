import { data } from "react-router";
import * as v from "valibot";
import type { Route } from "./+types/api.course-review";
import { getCurrentUserId } from "~/lib/session";
import { createReview } from "~/services/reviewService";
import { parseJsonBody } from "~/lib/validation";

const courseReviewSchema = v.object({
  courseId: v.number(),
  rating: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)),
});

const KNOWN_ERRORS = new Set([
  "Rating must be an integer between 1 and 5",
  "User is not enrolled in this course",
  "User has already reviewed this course",
]);

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  let parsed;
  try {
    parsed = await parseJsonBody(request, courseReviewSchema);
  } catch {
    throw data("Invalid request body", { status: 400 });
  }

  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { courseId, rating } = parsed.data;

  try {
    const review = createReview(currentUserId, courseId, rating);
    return { success: true, review };
  } catch (err) {
    const message =
      err instanceof Error && KNOWN_ERRORS.has(err.message)
        ? err.message
        : "Failed to create review";
    return data({ error: message }, { status: 422 });
  }
}
