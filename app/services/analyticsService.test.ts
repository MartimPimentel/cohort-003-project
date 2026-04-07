import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
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
  getAdminRevenueTimeSeries,
  getAdminCourseBreakdown,
  getAdminInstructors,
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

  // ─── getAdminRevenueTimeSeries ───

  describe("getAdminRevenueTimeSeries", () => {
    it("returns empty array for 'all' period when there are no purchases", () => {
      expect(getAdminRevenueTimeSeries({ period: "all" })).toEqual([]);
    });

    it("returns 7 data points for '7d' period", () => {
      const result = getAdminRevenueTimeSeries({ period: "7d" });
      expect(result).toHaveLength(7);
    });

    it("returns 30 data points for '30d' period", () => {
      const result = getAdminRevenueTimeSeries({ period: "30d" });
      expect(result).toHaveLength(30);
    });

    it("returns 12 data points for '12m' period", () => {
      const result = getAdminRevenueTimeSeries({ period: "12m" });
      expect(result).toHaveLength(12);
    });

    it("all data points default to 0 revenue with no purchases", () => {
      const result = getAdminRevenueTimeSeries({ period: "7d" });
      expect(result.every((p) => p.revenue === 0)).toBe(true);
    });

    it("includes revenue for matching purchase in '7d' period", () => {
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

      const result = getAdminRevenueTimeSeries({ period: "7d" });
      const total = result.reduce((sum, p) => sum + p.revenue, 0);
      expect(total).toBe(4999);
    });

    it("excludes purchases outside the 7d window from time series", () => {
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

      const result = getAdminRevenueTimeSeries({ period: "7d" });
      const total = result.reduce((sum, p) => sum + p.revenue, 0);
      expect(total).toBe(0);
    });

    it("uses daily labels (YYYY-MM-DD) for '7d' period", () => {
      const result = getAdminRevenueTimeSeries({ period: "7d" });
      expect(result[0].label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("uses monthly labels (YYYY-MM) for '12m' period", () => {
      const result = getAdminRevenueTimeSeries({ period: "12m" });
      expect(result[0].label).toMatch(/^\d{4}-\d{2}$/);
    });

    it("aggregates multiple purchases on the same day into one data point", () => {
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
          courseId: base.course.id,
          pricePaid: 2000,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();

      const result = getAdminRevenueTimeSeries({ period: "7d" });
      const today = RECENT_DATE.slice(0, 10);
      const todayPoint = result.find((p) => p.label === today);
      expect(todayPoint?.revenue).toBe(3000);
    });
  });

  // ─── getAdminCourseBreakdown ───

  describe("getAdminCourseBreakdown", () => {
    it("returns empty array when no courses exist", () => {
      testDb.delete(schema.courses).run();
      expect(getAdminCourseBreakdown({ period: "30d" })).toEqual([]);
    });

    it("returns course with zeroed metrics when no purchases or enrollments", () => {
      const rows = getAdminCourseBreakdown({ period: "all" });
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Test Course");
      expect(rows[0].revenue).toBe(0);
      expect(rows[0].sales).toBe(0);
      expect(rows[0].enrollments).toBe(0);
      expect(rows[0].avgRating).toBeNull();
    });

    it("includes instructor name on each row", () => {
      const rows = getAdminCourseBreakdown({ period: "all" });
      expect(rows[0].instructorName).toBe("Test Instructor");
    });

    it("includes list price from courses table", () => {
      testDb
        .update(schema.courses)
        .set({ price: 4999 })
        .where(eq(schema.courses.id, base.course.id))
        .run();

      const rows = getAdminCourseBreakdown({ period: "all" });
      expect(rows[0].listPrice).toBe(4999);
    });

    it("sums revenue and counts sales for the selected period", () => {
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          pricePaid: 2000,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.instructor.id,
          courseId: base.course.id,
          pricePaid: 3000,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();

      const rows = getAdminCourseBreakdown({ period: "30d" });
      expect(rows[0].revenue).toBe(5000);
      expect(rows[0].sales).toBe(2);
    });

    it("excludes purchases outside the period when summing revenue", () => {
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

      const rows = getAdminCourseBreakdown({ period: "7d" });
      expect(rows[0].revenue).toBe(0);
      expect(rows[0].sales).toBe(0);
    });

    it("counts enrollments for the selected period", () => {
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

      const rows = getAdminCourseBreakdown({ period: "30d" });
      expect(rows[0].enrollments).toBe(1);
    });

    it("includes average rating from course reviews", () => {
      testDb
        .insert(schema.courseReviews)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          rating: 4,
        })
        .run();
      testDb
        .insert(schema.courseReviews)
        .values({
          userId: base.instructor.id,
          courseId: base.course.id,
          rating: 2,
        })
        .run();

      const rows = getAdminCourseBreakdown({ period: "all" });
      expect(rows[0].avgRating).toBe(3);
    });

    it("filters by instructorId when provided", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other Instructor",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "Another course",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .run();

      const rows = getAdminCourseBreakdown({
        period: "all",
        instructorId: base.instructor.id,
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Test Course");
    });

    it("orders courses by revenue descending", () => {
      const course2 = testDb
        .insert(schema.courses)
        .values({
          title: "Low Earner",
          slug: "low-earner",
          description: "Low revenue course",
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
          pricePaid: 9999,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();
      testDb
        .insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: course2.id,
          pricePaid: 100,
          country: null,
          createdAt: RECENT_DATE,
        })
        .run();

      const rows = getAdminCourseBreakdown({ period: "all" });
      expect(rows[0].title).toBe("Test Course");
      expect(rows[1].title).toBe("Low Earner");
    });
  });

  // ─── getAdminInstructors ───

  describe("getAdminInstructors", () => {
    it("returns empty array when no instructors have courses", () => {
      // Remove the default course so no instructor has courses
      testDb.delete(schema.courses).run();
      expect(getAdminInstructors()).toEqual([]);
    });

    it("returns instructors who have at least one course", () => {
      const instructors = getAdminInstructors();
      expect(instructors).toHaveLength(1);
      expect(instructors[0].name).toBe("Test Instructor");
    });

    it("does not return duplicates when instructor has multiple courses", () => {
      testDb
        .insert(schema.courses)
        .values({
          title: "Second Course",
          slug: "second-course",
          description: "Another course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .run();

      const instructors = getAdminInstructors();
      expect(instructors).toHaveLength(1);
    });

    it("returns multiple distinct instructors", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Zara Instructor",
          email: "zara@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      testDb
        .insert(schema.courses)
        .values({
          title: "Zara Course",
          slug: "zara-course",
          description: "A course",
          instructorId: otherInstructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .run();

      const instructors = getAdminInstructors();
      expect(instructors).toHaveLength(2);
      // ordered by name ascending
      expect(instructors[0].name).toBe("Test Instructor");
      expect(instructors[1].name).toBe("Zara Instructor");
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
