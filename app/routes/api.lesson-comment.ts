import { data } from "react-router";
import * as v from "valibot";
import type { Route } from "./+types/api.lesson-comment";
import { getCurrentUserId } from "~/lib/session";
import {
  createComment,
  updateComment,
  deleteComment,
  getCommentsForLesson,
  getTopLevelCommentCount,
  CommentError,
} from "~/services/commentService";
import { getLessonById } from "~/services/lessonService";
import { getModuleById } from "~/services/moduleService";
import { getCourseById } from "~/services/courseService";
import { isUserEnrolled } from "~/services/enrollmentService";
import { parseJsonBody } from "~/lib/validation";

const loaderParamsSchema = v.object({
  lessonId: v.pipe(v.unknown(), v.toNumber(), v.integer(), v.gtValue(0)),
  limit: v.optional(
    v.pipe(v.unknown(), v.toNumber(), v.integer(), v.minValue(1), v.maxValue(50)),
    20
  ),
  offset: v.optional(v.pipe(v.unknown(), v.toNumber(), v.integer(), v.minValue(0)), 0),
});

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const params = v.safeParse(loaderParamsSchema, {
    lessonId: url.searchParams.get("lessonId"),
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  if (!params.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { lessonId, limit, offset } = params.output;

  // Resolve lesson → module → course for auth check
  const lesson = getLessonById(lessonId);
  if (!lesson) {
    throw data("Lesson not found", { status: 404 });
  }

  const mod = getModuleById(lesson.moduleId);
  if (!mod) {
    throw data("Module not found", { status: 404 });
  }

  const course = getCourseById(mod.courseId);
  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const isInstructor = currentUserId === course.instructorId;
  if (!isInstructor && !isUserEnrolled(currentUserId, course.id)) {
    throw data("Not authorized", { status: 403 });
  }

  const comments = getCommentsForLesson(lessonId, limit, offset);
  const totalTopLevelCount = getTopLevelCommentCount(lessonId);

  return { comments, totalTopLevelCount };
}

const createSchema = v.object({
  intent: v.literal("create"),
  lessonId: v.number(),
  content: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  parentId: v.optional(v.nullable(v.number())),
});

const editSchema = v.object({
  intent: v.literal("edit"),
  commentId: v.number(),
  content: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});

const deleteSchema = v.object({
  intent: v.literal("delete"),
  commentId: v.number(),
});

const commentActionSchema = v.variant("intent", [
  createSchema,
  editSchema,
  deleteSchema,
]);

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  let parsed;
  try {
    parsed = await parseJsonBody(request, commentActionSchema);
  } catch {
    throw data("Invalid request body", { status: 400 });
  }

  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { data: body } = parsed;

  if (body.intent === "create") {
    try {
      const comment = createComment(
        currentUserId,
        body.lessonId,
        body.content,
        body.parentId ?? null
      );
      return { success: true, comment };
    } catch (err) {
      if (err instanceof CommentError) {
        return data({ error: err.message }, { status: err.statusCode });
      }
      return data({ error: "Failed to create comment" }, { status: 500 });
    }
  }

  if (body.intent === "edit") {
    try {
      const comment = updateComment(body.commentId, currentUserId, body.content);
      return { success: true, comment };
    } catch (err) {
      if (err instanceof CommentError) {
        return data({ error: err.message }, { status: err.statusCode });
      }
      return data({ error: "Failed to edit comment" }, { status: 500 });
    }
  }

  if (body.intent === "delete") {
    try {
      const result = deleteComment(body.commentId, currentUserId);
      return { success: true, ...result };
    } catch (err) {
      if (err instanceof CommentError) {
        return data({ error: err.message }, { status: err.statusCode });
      }
      return data({ error: "Failed to delete comment" }, { status: 500 });
    }
  }

  throw data("Unknown intent", { status: 400 });
}
