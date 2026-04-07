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
  getAdminTotalRevenue,
  getAdminTotalEnrollments,
  getAdminTopCourse,
  getAdminAnalyticsSummary,
} from "./analyticsService";

const OLD_DATE = "2020-01-01T00:00:00.000Z";
const RECENT_DATE = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago

describe("analyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ─── getAdminTotalRevenue ───

  describe("getAdminTotalRevenue", () => {
    it("returns 0 when there are no purchases", () => {
      expect(getAdminTotalRevenue({ period: "30d" })).toBe(0);
    });

    it("sums all purchase amounts for 'all' period", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 4999,
          country: null,
          createdAt: OLD_DATE,
        })
        .run();
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.instructor.id,
          courseId: base.course.id,
          pricePaid: 2999,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();

      expect(getAdminTotalRevenue({ period: "all" })).toBe(7998);
    });

    it("excludes purchases outside the 7d window", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 4999,
          country: null,
          createdAt: OLD_DATE,
        })
        .run();
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.instructor.id,
          courseId: base.course.id,
          pricePaid: 2999,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();

      expect(getAdminTotalRevenue({ period: "7d" })).toBe(2999);
    });

    it("excludes purchases outside the 30d window", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 4999,
          country: null,
          createdAt: OLD_DATE,
        })
        .run();
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.instructor.id,
          courseId: base.course.id,
          pricePaid: 2999,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();

      expect(getAdminTotalRevenue({ period: "30d" })).toBe(2999);
    });

    it("excludes purchases outside the 12m window", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 4999,
          country: null,
          createdAt: OLD_DATE,
        })
        .run();
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.instructor.id,
          courseId: base.course.id,
          pricePaid: 2999,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();

      expect(getAdminTotalRevenue({ period: "12m" })).toBe(2999);
    });

    it("includes all purchases for 'all' period regardless of date", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 4999,
          country: null,
          createdAt: OLD_DATE,
        })
        .run();

      expect(getAdminTotalRevenue({ period: "all" })).toBe(4999);
    });
  });

  // ─── getAdminTotalEnrollments ───

  describe("getAdminTotalEnrollments", () => {
    it("returns 0 when there are no enrollments", () => {
      expect(getAdminTotalEnrollments({ period: "30d" })).toBe(0);
    });

    it("counts all enrollments for 'all' period", () => {
      testDb
        .insert(schema.enrollments)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          enrolledAt: RECENT_DATE,
        })
        .run();
      testDb
        .insert(schema.enrollments)
        .values({
          userId: base.instructor.id,
          courseId: base.course.id,
          enrolledAt: OLD_DATE,
        })
        .run();

      expect(getAdminTotalEnrollments({ period: "all" })).toBe(2);
    });

    it("excludes enrollments outside the 7d window", () => {
      testDb
        .insert(schema.enrollments)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          enrolledAt: RECENT_DATE,
        })
        .run();
      testDb
        .insert(schema.enrollments)
        .values({
          userId: base.instructor.id,
          courseId: base.course.id,
          enrolledAt: OLD_DATE,
        })
        .run();

      expect(getAdminTotalEnrollments({ period: "7d" })).toBe(1);
    });

    it("excludes enrollments outside the 30d window", () => {
      testDb
        .insert(schema.enrollments)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          enrolledAt: RECENT_DATE,
        })
        .run();
      testDb
        .insert(schema.enrollments)
        .values({
          userId: base.instructor.id,
          courseId: base.course.id,
          enrolledAt: OLD_DATE,
        })
        .run();

      expect(getAdminTotalEnrollments({ period: "30d" })).toBe(1);
    });
  });

  // ─── getAdminTopCourse ───

  describe("getAdminTopCourse", () => {
    it("returns null when there are no purchases", () => {
      expect(getAdminTopCourse({ period: "all" })).toBeNull();
    });

    it("identifies the course with highest revenue", () => {
      const course2 = testDb
        .insert(schema.courses)
        .values({
          title: "High Earner",
          slug: "high-earner",
          description: "Top course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 1000,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.instructor.id,
          courseId: course2.id,
          pricePaid: 9999,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();

      const top = getAdminTopCourse({ period: "all" });
      expect(top).not.toBeNull();
      expect(top!.courseId).toBe(course2.id);
      expect(top!.title).toBe("High Earner");
      expect(top!.revenue).toBe(9999);
    });

    it("excludes purchases outside the time period when finding top course", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 9999,
          country: null,
          createdAt: OLD_DATE,
        })
        .run();

      const top = getAdminTopCourse({ period: "7d" });
      expect(top).toBeNull();
    });
  });

  // ─── getAdminAnalyticsSummary ───

  describe("getAdminAnalyticsSummary", () => {
    it("returns zeroed summary when no data exists", () => {
      const summary = getAdminAnalyticsSummary({ period: "30d" });
      expect(summary.totalRevenue).toBe(0);
      expect(summary.totalEnrollments).toBe(0);
      expect(summary.topCourse).toBeNull();
    });

    it("returns combined revenue, enrollments, and top course", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 4999,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();
      testDb
        .insert(schema.enrollments)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          enrolledAt: RECENT_DATE,
        })
        .run();

      const summary = getAdminAnalyticsSummary({ period: "30d" });
      expect(summary.totalRevenue).toBe(4999);
      expect(summary.totalEnrollments).toBe(1);
      expect(summary.topCourse).not.toBeNull();
      expect(summary.topCourse!.title).toBe("Test Course");
    });
  });
});
