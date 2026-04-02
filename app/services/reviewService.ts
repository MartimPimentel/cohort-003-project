import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "~/db";
import { courseReviews } from "~/db/schema";
import { isUserEnrolled } from "~/services/enrollmentService";

// ─── Review Service ───
// Handles course review creation and rating aggregation.
// Uses positional parameters (project convention).

export function getReviewByUserAndCourse(userId: number, courseId: number) {
  return db
    .select()
    .from(courseReviews)
    .where(
      and(eq(courseReviews.userId, userId), eq(courseReviews.courseId, courseId))
    )
    .get();
}

export function createReview(userId: number, courseId: number, rating: number) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be an integer between 1 and 5");
  }

  if (!isUserEnrolled(userId, courseId)) {
    throw new Error("User is not enrolled in this course");
  }

  const existing = getReviewByUserAndCourse(userId, courseId);
  if (existing) {
    throw new Error("User has already reviewed this course");
  }

  try {
    return db
      .insert(courseReviews)
      .values({ userId, courseId, rating })
      .returning()
      .get();
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint")) {
      throw new Error("User has already reviewed this course");
    }
    throw err;
  }
}

export function getAverageRating(courseId: number) {
  const result = db
    .select({
      average: sql<number | null>`avg(${courseReviews.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId))
    .get();

  return {
    average: result?.average ?? null,
    count: result?.count ?? 0,
  };
}

export function getAverageRatingsForCourses(courseIds: number[]) {
  const map = new Map<number, { average: number; count: number }>();

  if (courseIds.length === 0) {
    return map;
  }

  const results = db
    .select({
      courseId: courseReviews.courseId,
      average: sql<number>`avg(${courseReviews.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseReviews)
    .where(inArray(courseReviews.courseId, courseIds))
    .groupBy(courseReviews.courseId)
    .all();

  for (const row of results) {
    map.set(row.courseId, { average: row.average, count: row.count });
  }

  return map;
}
