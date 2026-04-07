import { gte, eq, sql } from "drizzle-orm";
import { db } from "~/db";
import { purchases, enrollments, courses } from "~/db/schema";

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
