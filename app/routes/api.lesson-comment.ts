import { data } from "react-router";
import { z } from "zod";
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

const loaderParamsSchema = z.object({
  lessonId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const params = loaderParamsSchema.safeParse({
    lessonId: url.searchParams.get("lessonId"),
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  if (!params.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { lessonId, limit, offset } = params.data;

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

const createSchema = z.object({
  intent: z.literal("create"),
  lessonId: z.number(),
  content: z.string().transform(s => s.trim()).pipe(z.string().min(1).max(500)),
  parentId: z.number().nullable().optional(),
});

const editSchema = z.object({
  intent: z.literal("edit"),
  commentId: z.number(),
  content: z.string().transform(s => s.trim()).pipe(z.string().min(1).max(500)),
});

const deleteSchema = z.object({
  intent: z.literal("delete"),
  commentId: z.number(),
});

const commentActionSchema = z.discriminatedUnion("intent", [
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
