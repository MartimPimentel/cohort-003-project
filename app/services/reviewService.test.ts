import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  createReview,
  getReviewByUserAndCourse,
  getAverageRating,
  getAverageRatingsForCourses,
} from "./reviewService";
import { enrollUser } from "./enrollmentService";

describe("reviewService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ─── createReview ───

  describe("createReview", () => {
    it("creates a review successfully for an enrolled user", () => {
      enrollUser(base.user.id, base.course.id, false, true);

      const review = createReview(base.user.id, base.course.id, 4);

      expect(review).toBeDefined();
      expect(review!.userId).toBe(base.user.id);
      expect(review!.courseId).toBe(base.course.id);
      expect(review!.rating).toBe(4);
      expect(review!.id).toBeDefined();
      expect(review!.createdAt).toBeDefined();
    });

    it("throws for rating less than 1", () => {
      enrollUser(base.user.id, base.course.id, false, true);
      expect(() => createReview(base.user.id, base.course.id, 0)).toThrow(
        "Rating must be an integer between 1 and 5"
      );
    });

    it("throws for rating greater than 5", () => {
      enrollUser(base.user.id, base.course.id, false, true);
      expect(() => createReview(base.user.id, base.course.id, 6)).toThrow(
        "Rating must be an integer between 1 and 5"
      );
    });

    it("throws for duplicate review (same user + course)", () => {
      enrollUser(base.user.id, base.course.id, false, true);
      createReview(base.user.id, base.course.id, 3);

      expect(() => createReview(base.user.id, base.course.id, 5)).toThrow(
        "User has already reviewed this course"
      );
    });

    it("throws for unenrolled user", () => {
      expect(() => createReview(base.user.id, base.course.id, 4)).toThrow(
        "User is not enrolled in this course"
      );
    });
  });

  // ─── getReviewByUserAndCourse ───

  describe("getReviewByUserAndCourse", () => {
    it("returns the review when it exists", () => {
      enrollUser(base.user.id, base.course.id, false, true);
      createReview(base.user.id, base.course.id, 5);

      const review = getReviewByUserAndCourse(base.user.id, base.course.id);
      expect(review).toBeDefined();
      expect(review!.rating).toBe(5);
    });

    it("returns undefined when review does not exist", () => {
      const review = getReviewByUserAndCourse(base.user.id, base.course.id);
      expect(review).toBeUndefined();
    });
  });

  // ─── getAverageRating ───

  describe("getAverageRating", () => {
    it("returns correct average and count", () => {
      // Create a second user
      const user2 = testDb
        .insert(schema.users)
        .values({ name: "User 2", email: "user2@example.com", role: schema.UserRole.Student })
        .returning()
        .get();

      enrollUser(base.user.id, base.course.id, false, true);
      enrollUser(user2.id, base.course.id, false, true);

      createReview(base.user.id, base.course.id, 4);
      createReview(user2.id, base.course.id, 2);

      const { average, count } = getAverageRating(base.course.id);
      expect(count).toBe(2);
      expect(average).toBe(3);
    });

    it("returns null average and 0 count for course with no reviews", () => {
      const { average, count } = getAverageRating(base.course.id);
      expect(average).toBeNull();
      expect(count).toBe(0);
    });
  });

  // ─── getAverageRatingsForCourses ───

  describe("getAverageRatingsForCourses", () => {
    it("returns empty map for empty input", () => {
      const map = getAverageRatingsForCourses([]);
      expect(map.size).toBe(0);
    });

    it("returns map with correct data for multiple courses", () => {
      const course2 = testDb
        .insert(schema.courses)
        .values({
          title: "Course 2",
          slug: "course-2",
          description: "Second course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      const user2 = testDb
        .insert(schema.users)
        .values({ name: "User 2", email: "user2@example.com", role: schema.UserRole.Student })
        .returning()
        .get();

      enrollUser(base.user.id, base.course.id, false, true);
      enrollUser(user2.id, course2.id, false, true);

      createReview(base.user.id, base.course.id, 5);
      createReview(user2.id, course2.id, 3);

      const map = getAverageRatingsForCourses([base.course.id, course2.id]);

      expect(map.size).toBe(2);
      expect(map.get(base.course.id)).toEqual({ average: 5, count: 1 });
      expect(map.get(course2.id)).toEqual({ average: 3, count: 1 });
    });

    it("does not include courses with no reviews in the map", () => {
      const map = getAverageRatingsForCourses([base.course.id]);
      expect(map.has(base.course.id)).toBe(false);
    });
  });
});
