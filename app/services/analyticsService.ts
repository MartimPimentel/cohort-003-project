import { gte, eq, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  purchases,
  enrollments,
  courses,
  users,
  courseReviews,
} from "~/db/schema";

// ─── Analytics Service ───
// Platform-wide analytics aggregations for the admin dashboard.
// Per-instructor filtering is not needed here — these functions aggregate
// across all courses and instructors.

export type TimePeriod = "7d" | "30d" | "12m" | "all";

export function getPeriodCutoff(period: TimePeriod): string | null {
  if (period === "all") return null;

  const now = new Date();

  if (period === "7d") {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);
    return cutoff.toISOString();
  }

  if (period === "30d") {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);
    return cutoff.toISOString();
  }

  // "12m"
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 12);
  return cutoff.toISOString();
}

export function getAdminTotalRevenue({ period }: { period: TimePeriod }) {
  const cutoff = getPeriodCutoff(period);

  const result = db
    .select({ total: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)` })
    .from(purchases)
    .where(cutoff ? gte(purchases.createdAt, cutoff) : undefined)
    .get();

  return result?.total ?? 0;
}

export function getAdminTotalEnrollments({ period }: { period: TimePeriod }) {
  const cutoff = getPeriodCutoff(period);

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .where(cutoff ? gte(enrollments.enrolledAt, cutoff) : undefined)
    .get();

  return result?.count ?? 0;
}

export function getAdminTopCourse({ period }: { period: TimePeriod }) {
  const cutoff = getPeriodCutoff(period);

  const result = db
    .select({
      courseId: purchases.courseId,
      title: courses.title,
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(cutoff ? gte(purchases.createdAt, cutoff) : undefined)
    .groupBy(purchases.courseId)
    .orderBy(sql`sum(${purchases.pricePaid}) desc`)
    .limit(1)
    .get();

  return result ?? null;
}

export function getAdminAnalyticsSummary({ period }: { period: TimePeriod }) {
  return {
    totalRevenue: getAdminTotalRevenue({ period }),
    totalEnrollments: getAdminTotalEnrollments({ period }),
    topCourse: getAdminTopCourse({ period }),
  };
}

export type RevenueDataPoint = { label: string; revenue: number };

export function getAdminRevenueTimeSeries({
  period,
}: {
  period: TimePeriod;
}): RevenueDataPoint[] {
  const isMonthly = period === "12m" || period === "all";
  const cutoff = getPeriodCutoff(period);
  const fmt = isMonthly ? "%Y-%m" : "%Y-%m-%d";

  const rows = db
    .select({
      bucket: sql<string>`strftime(${fmt}, ${purchases.createdAt})`,
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`,
    })
    .from(purchases)
    .where(cutoff ? gte(purchases.createdAt, cutoff) : undefined)
    .groupBy(sql`strftime(${fmt}, ${purchases.createdAt})`)
    .orderBy(sql`strftime(${fmt}, ${purchases.createdAt})`)
    .all();

  const lookup = new Map(rows.map((r) => [r.bucket, r.revenue]));
  const now = new Date();

  const slots: string[] = [];

  if (period === "7d") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      slots.push(d.toISOString().slice(0, 10));
    }
  } else if (period === "30d") {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      slots.push(d.toISOString().slice(0, 10));
    }
  } else if (period === "12m") {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      slots.push(d.toISOString().slice(0, 7));
    }
  } else {
    // "all": span from first purchase month to current month
    if (rows.length === 0) return [];
    const firstBucket = rows[0].bucket; // "YYYY-MM"
    let [y, m] = firstBucket.split("-").map(Number);
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1;
    while (y < endYear || (y === endYear && m <= endMonth)) {
      slots.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }

  return slots.map((slot) => ({ label: slot, revenue: lookup.get(slot) ?? 0 }));
}

export type CourseBreakdownRow = {
  courseId: number;
  title: string;
  instructorId: number;
  instructorName: string;
  listPrice: number;
  revenue: number;
  sales: number;
  enrollments: number;
  avgRating: number | null;
};

export function getAdminCourseBreakdown({
  period,
  instructorId,
}: {
  period: TimePeriod;
  instructorId?: number;
}): CourseBreakdownRow[] {
  const cutoff = getPeriodCutoff(period);

  const purchaseSq = db
    .select({
      courseId: purchases.courseId,
      revenue: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`.as(
        "revenue"
      ),
      sales: sql<number>`count(*)`.as("sales"),
    })
    .from(purchases)
    .where(cutoff ? gte(purchases.createdAt, cutoff) : undefined)
    .groupBy(purchases.courseId)
    .as("purchase_agg");

  const enrollmentSq = db
    .select({
      courseId: enrollments.courseId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(enrollments)
    .where(cutoff ? gte(enrollments.enrolledAt, cutoff) : undefined)
    .groupBy(enrollments.courseId)
    .as("enrollment_agg");

  const ratingSq = db
    .select({
      courseId: courseReviews.courseId,
      avgRating: sql<number | null>`avg(${courseReviews.rating})`.as(
        "avg_rating"
      ),
    })
    .from(courseReviews)
    .groupBy(courseReviews.courseId)
    .as("rating_agg");

  return db
    .select({
      courseId: courses.id,
      title: courses.title,
      instructorId: courses.instructorId,
      instructorName: users.name,
      listPrice: courses.price,
      revenue: sql<number>`coalesce(${purchaseSq.revenue}, 0)`,
      sales: sql<number>`coalesce(${purchaseSq.sales}, 0)`,
      enrollments: sql<number>`coalesce(${enrollmentSq.count}, 0)`,
      avgRating: ratingSq.avgRating,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .leftJoin(purchaseSq, eq(courses.id, purchaseSq.courseId))
    .leftJoin(enrollmentSq, eq(courses.id, enrollmentSq.courseId))
    .leftJoin(ratingSq, eq(courses.id, ratingSq.courseId))
    .where(instructorId ? eq(courses.instructorId, instructorId) : undefined)
    .orderBy(sql`coalesce(${purchaseSq.revenue}, 0) desc`)
    .all();
}

export function getAdminInstructors(): { id: number; name: string }[] {
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .orderBy(users.name)
    .all();
}
