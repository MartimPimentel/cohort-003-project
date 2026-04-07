import { Link, data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/admin.analytics";
import { getCurrentUserId } from "~/lib/session";
import { getUserById } from "~/services/userService";
import {
  getAdminAnalyticsSummary,
  getAdminRevenueTimeSeries,
  type TimePeriod,
} from "~/services/analyticsService";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { UserRole } from "~/db/schema";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  AlertTriangle,
  BarChart3,
  TrendingUp,
  Users,
  Trophy,
} from "lucide-react";
import { formatPrice, cn } from "~/lib/utils";

const VALID_PERIODS: TimePeriod[] = ["7d", "30d", "12m", "all"];

const PERIOD_LABELS: Record<TimePeriod, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "12m": "12 months",
  all: "All time",
};

export function meta() {
  return [
    { title: "Analytics — Cadence Admin" },
    { name: "description", content: "Platform-wide analytics dashboard" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to access analytics.", {
      status: 401,
    });
  }

  const currentUser = getUserById(currentUserId);

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only admins can access this page.", { status: 403 });
  }

  const url = new URL(request.url);
  const rawPeriod = url.searchParams.get("period") ?? "30d";
  const period: TimePeriod = VALID_PERIODS.includes(rawPeriod as TimePeriod)
    ? (rawPeriod as TimePeriod)
    : "30d";

  const summary = getAdminAnalyticsSummary({ period });
  const timeSeries = getAdminRevenueTimeSeries({ period });

  return { summary, period, timeSeries };
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-2 h-5 w-80" />
      </div>
      <Skeleton className="mb-6 h-9 w-72" />
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
                <Skeleton className="mt-1 h-4 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatYAxis(cents: number) {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

function formatTooltipLabel(cents: unknown) {
  const value = typeof cents === "number" ? cents : 0;
  return formatPrice(value);
}

export default function AdminAnalytics({ loaderData }: Route.ComponentProps) {
  const { summary, period, timeSeries } = loaderData;
  const { totalRevenue, totalEnrollments, topCourse } = summary;

  const isEmpty = totalRevenue === 0 && totalEnrollments === 0;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Analytics</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="mt-1 text-muted-foreground">
          Platform-wide revenue and enrollment metrics
        </p>
      </div>

      {/* Time period selector */}
      <div className="mb-6 inline-flex items-center gap-1 rounded-lg bg-muted p-1">
        {VALID_PERIODS.map((p) => (
          <Link
            key={p}
            to={`?period=${p}`}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              period === p
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="mb-4 size-12 text-muted-foreground/50" />
          <h2 className="text-lg font-medium">No data yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Revenue and enrollment data will appear here once courses are
            purchased or students enroll.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Total Revenue */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Total Revenue
                </span>
                <TrendingUp className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatPrice(totalRevenue)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Across all courses — {PERIOD_LABELS[period]}
                </p>
              </CardContent>
            </Card>

            {/* Total Enrollments */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Total Enrollments
                </span>
                <Users className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {totalEnrollments.toLocaleString()}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  New enrollments — {PERIOD_LABELS[period]}
                </p>
              </CardContent>
            </Card>

            {/* Top Earning Course */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Top Earning Course
                </span>
                <Trophy className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {topCourse ? (
                  <>
                    <div
                      className="truncate text-2xl font-bold"
                      title={topCourse.title}
                    >
                      {topCourse.title}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatPrice(topCourse.revenue)} — {PERIOD_LABELS[period]}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-muted-foreground">
                      —
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      No sales in this period
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Revenue Over Time Chart */}
          <Card>
            <CardHeader>
              <span className="text-sm font-medium text-muted-foreground">
                Revenue Over Time
              </span>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart
                  data={timeSeries}
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={formatYAxis}
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <Tooltip
                    formatter={(value) => [
                      formatTooltipLabel(value),
                      "Revenue",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading analytics.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only admins can access this page.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
