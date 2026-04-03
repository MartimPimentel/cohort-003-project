import { eq, and, sql, isNull, asc, inArray } from "drizzle-orm";
import { db } from "~/db";
import { lessonComments, users } from "~/db/schema";
import { isUserEnrolled } from "~/services/enrollmentService";
import { getLessonById } from "~/services/lessonService";
import { getModuleById } from "~/services/moduleService";
import { getCourseById } from "~/services/courseService";

// ─── Comment Service ───
// Handles lesson comment creation, retrieval, editing, and deletion.
// Uses positional parameters (project convention).

const THREAD_REPLY_LIMIT = 50;
const USER_REPLY_LIMIT_PER_THREAD = 10;
const COMMENT_MAX_LENGTH = 500;

// Typed error so route handlers can use instanceof instead of string matching.
export class CommentError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "CommentError";
  }
}

export function getCommentsForLesson(
  lessonId: number,
  limit?: number,
  offset?: number
) {
  // 1. Query top-level comments (parentId is null) with limit/offset, join with users
  const baseQuery = db
    .select({
      id: lessonComments.id,
      lessonId: lessonComments.lessonId,
      userId: lessonComments.userId,
      parentId: lessonComments.parentId,
      content: lessonComments.content,
      isDeleted: lessonComments.isDeleted,
      editedAt: lessonComments.editedAt,
      createdAt: lessonComments.createdAt,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(and(eq(lessonComments.lessonId, lessonId), isNull(lessonComments.parentId)))
    .orderBy(asc(lessonComments.createdAt))
    .$dynamic();

  const topLevelComments = limit !== undefined
    ? baseQuery.limit(limit).offset(offset ?? 0).all()
    : baseQuery.all();

  if (topLevelComments.length === 0) {
    return [];
  }

  const topLevelIds = topLevelComments.map((c) => c.id);

  // 2. Query replies for those top-level comments, joined with users
  const replies = db
    .select({
      id: lessonComments.id,
      lessonId: lessonComments.lessonId,
      userId: lessonComments.userId,
      parentId: lessonComments.parentId,
      content: lessonComments.content,
      isDeleted: lessonComments.isDeleted,
      editedAt: lessonComments.editedAt,
      createdAt: lessonComments.createdAt,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(inArray(lessonComments.parentId, topLevelIds))
    .orderBy(asc(lessonComments.createdAt))
    .all();

  // 3. Return combined flat array, redacting soft-deleted comment user info (F1e)
  return [...topLevelComments, ...replies].map((c) => {
    if (c.isDeleted) {
      return { ...c, content: "[comment removed]", userName: "Deleted", userAvatarUrl: null, userId: null };
    }
    return c;
  });
}

export function getCommentById(commentId: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();
}

export function getReplyCount(parentId: number): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonComments)
    .where(eq(lessonComments.parentId, parentId))
    .get();
  return result?.count ?? 0;
}

export function getUserReplyCount(parentId: number, userId: number): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonComments)
    .where(and(eq(lessonComments.parentId, parentId), eq(lessonComments.userId, userId)))
    .get();
  return result?.count ?? 0;
}

export function getTopLevelCommentCount(lessonId: number): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonComments)
    .where(and(eq(lessonComments.lessonId, lessonId), isNull(lessonComments.parentId)))
    .get();
  return result?.count ?? 0;
}

export function createComment(
  userId: number,
  lessonId: number,
  content: string,
  parentId: number | null
) {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new CommentError("Comment content is required", 422);
  }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    throw new CommentError(`Comment must be ${COMMENT_MAX_LENGTH} characters or less`, 422);
  }

  // Resolve lesson → module → course to get instructorId
  const lesson = getLessonById(lessonId);
  if (!lesson) {
    throw new CommentError("Lesson not found", 404);
  }

  const module = getModuleById(lesson.moduleId);
  if (!module) {
    throw new CommentError("Module not found", 404);
  }

  const course = getCourseById(module.courseId);
  if (!course) {
    throw new CommentError("Course not found", 404);
  }

  const instructorId = course.instructorId;

  // Check enrollment (skip for instructors)
  if (userId !== instructorId) {
    if (!isUserEnrolled(userId, course.id)) {
      throw new CommentError("User is not enrolled in this course", 403);
    }
  }

  // Validate parentId if provided
  if (parentId !== null) {
    const parentComment = getCommentById(parentId);

    if (!parentComment || parentComment.lessonId !== lessonId) {
      throw new CommentError("Parent comment not found", 404);
    }

    if (parentComment.isDeleted) {
      throw new CommentError("Cannot reply to a deleted comment", 422);
    }

    if (parentComment.parentId !== null) {
      throw new CommentError("Cannot reply to a reply", 422);
    }

    // Check thread reply limits inside a transaction to prevent race conditions.
    return db.transaction((tx) => {
      const replyCount = tx
        .select({ count: sql<number>`count(*)` })
        .from(lessonComments)
        .where(eq(lessonComments.parentId, parentId))
        .get()?.count ?? 0;

      if (replyCount >= THREAD_REPLY_LIMIT) {
        throw new CommentError(`Thread reply limit reached (${THREAD_REPLY_LIMIT})`, 422);
      }

      if (userId !== instructorId) {
        const userReplyCount = tx
          .select({ count: sql<number>`count(*)` })
          .from(lessonComments)
          .where(and(eq(lessonComments.parentId, parentId), eq(lessonComments.userId, userId)))
          .get()?.count ?? 0;

        if (userReplyCount >= USER_REPLY_LIMIT_PER_THREAD) {
          throw new CommentError(`Reply limit per user reached (${USER_REPLY_LIMIT_PER_THREAD})`, 422);
        }
      }

      return tx
        .insert(lessonComments)
        .values({ userId, lessonId, content: trimmed, parentId })
        .returning()
        .get();
    });
  }

  return db
    .insert(lessonComments)
    .values({ userId, lessonId, content: trimmed, parentId })
    .returning()
    .get();
}

export function updateComment(commentId: number, userId: number, content: string) {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new CommentError("Comment content is required", 422);
  }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    throw new CommentError(`Comment must be ${COMMENT_MAX_LENGTH} characters or less`, 422);
  }

  const comment = getCommentById(commentId);
  if (!comment) {
    throw new CommentError("Comment not found", 404);
  }

  if (comment.userId !== userId) {
    throw new CommentError("You can only edit your own comments", 403);
  }

  if (comment.isDeleted) {
    throw new CommentError("Cannot edit a deleted comment", 422);
  }

  return db
    .update(lessonComments)
    .set({ content: trimmed, editedAt: new Date().toISOString() })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}

export function deleteComment(
  commentId: number,
  userId: number
) {
  const comment = getCommentById(commentId);
  if (!comment) {
    throw new CommentError("Comment not found", 404);
  }

  // Resolve lesson → module → course to derive instructorId
  const lesson = getLessonById(comment.lessonId);
  if (!lesson) {
    throw new CommentError("Lesson not found", 404);
  }

  const module = getModuleById(lesson.moduleId);
  if (!module) {
    throw new CommentError("Module not found", 404);
  }

  const course = getCourseById(module.courseId);
  if (!course) {
    throw new CommentError("Course not found", 404);
  }

  const instructorId = course.instructorId;

  if (userId !== comment.userId && userId !== instructorId) {
    throw new CommentError("You don't have permission to delete this comment", 403);
  }

  const isTopLevel = comment.parentId === null;

  if (isTopLevel) {
    const replyCount = getReplyCount(commentId);
    if (replyCount > 0) {
      // Soft delete
      db.update(lessonComments)
        .set({ isDeleted: true })
        .where(eq(lessonComments.id, commentId))
        .run();
      return { deleted: true, soft: true };
    } else {
      // Hard delete
      db.delete(lessonComments).where(eq(lessonComments.id, commentId)).run();
      return { deleted: true, soft: false };
    }
  } else {
    // Reply: hard delete + ghost parent cleanup inside a transaction to prevent a
    // race condition where a concurrent insert slips between the count check and delete.
    db.transaction((tx) => {
      tx.delete(lessonComments).where(eq(lessonComments.id, commentId)).run();

      const parent = tx
        .select()
        .from(lessonComments)
        .where(eq(lessonComments.id, comment.parentId!))
        .get();

      if (parent && parent.isDeleted) {
        const replyCount = tx
          .select({ count: sql<number>`count(*)` })
          .from(lessonComments)
          .where(eq(lessonComments.parentId, parent.id))
          .get()?.count ?? 0;

        if (replyCount === 0) {
          tx.delete(lessonComments).where(eq(lessonComments.id, parent.id)).run();
        }
      }
    });

    return { deleted: true, soft: false };
  }
}
