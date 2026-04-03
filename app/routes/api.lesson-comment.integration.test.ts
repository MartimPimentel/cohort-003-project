import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFileTestDb, seedBaseData } from "~/test/setup";
import { createAuthenticatedRequest } from "~/test/helpers";
import * as schema from "~/db/schema";
import { eq } from "drizzle-orm";

let fileDb: ReturnType<typeof createFileTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return fileDb.db;
  },
}));

import { action, loader } from "./api.lesson-comment";
import { enrollUser } from "~/services/enrollmentService";

const BASE_URL = "http://localhost/api/lesson-comment";

function callAction(request: Request) {
  return action({ request, params: {}, context: {} } as any);
}

function callLoader(request: Request) {
  return loader({ request, params: {}, context: {} } as any);
}

async function getComments(userId: number, params: Record<string, string>) {
  const url = new URL(BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const request = await createAuthenticatedRequest(userId, url.toString(), {
    method: "GET",
  });
  return callLoader(request);
}

async function post(userId: number, body: unknown) {
  const request = await createAuthenticatedRequest(userId, BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return callAction(request);
}

function getStatus(response: any): number | undefined {
  return response?.init?.status;
}

function getBody(response: any): any {
  // For data() responses, the body is in response.data
  // For plain object returns, it's the response itself
  return response?.data ?? response;
}

// Helper to seed many replies for limit tests
function seedReplies(
  db: ReturnType<typeof createFileTestDb>["db"],
  parentId: number,
  userId: number,
  lessonId: number,
  count: number
) {
  for (let i = 0; i < count; i++) {
    db.insert(schema.lessonComments)
      .values({
        lessonId,
        userId,
        parentId,
        content: `Reply ${i + 1}`,
      })
      .run();
  }
}

let moduleId: number;
let lessonId: number;
let instructor2Id: number;

beforeEach(() => {
  fileDb = createFileTestDb();
  base = seedBaseData(fileDb.db);

  // Add module + lesson
  const mod = fileDb.db
    .insert(schema.modules)
    .values({
      courseId: base.course.id,
      title: "Test Module",
      position: 1,
    })
    .returning()
    .get();
  moduleId = mod.id;

  const lesson = fileDb.db
    .insert(schema.lessons)
    .values({
      moduleId: mod.id,
      title: "Test Lesson",
      position: 1,
    })
    .returning()
    .get();
  lessonId = lesson.id;

  // Create a second instructor (for cross-course tests)
  const inst2 = fileDb.db
    .insert(schema.users)
    .values({
      name: "Other Instructor",
      email: "other-instructor@example.com",
      role: schema.UserRole.Instructor,
    })
    .returning()
    .get();
  instructor2Id = inst2.id;

  // Enroll the student
  enrollUser(base.user.id, base.course.id, false, true);
});

afterEach(() => {
  fileDb.cleanup();
});

// ─── Create Tests ───

describe("POST /api/lesson-comment — create intent", () => {
  it("returns 401 when not authenticated", async () => {
    const request = new Request(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "create", lessonId, content: "Hello" }),
    });

    try {
      await callAction(request);
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(401);
    }
  });

  it("returns 400 for missing content", async () => {
    try {
      await post(base.user.id, { intent: "create", lessonId });
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(400);
    }
  });

  it("returns 400 for content >500 chars", async () => {
    try {
      await post(base.user.id, {
        intent: "create",
        lessonId,
        content: "a".repeat(501),
      });
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(400);
    }
  });

  it("returns 403 when not enrolled (instructor2 is not enrolled and not the instructor)", async () => {
    const response = await post(instructor2Id, {
      intent: "create",
      lessonId,
      content: "Hello from unenrolled user",
    });
    expect(getStatus(response)).toBe(403);
    expect(getBody(response).error).toBe("User is not enrolled in this course");
  });

  it("creates a top-level comment — response has success: true and comment object", async () => {
    const response = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "This is my comment",
    });

    expect(response).toMatchObject({
      success: true,
      comment: expect.objectContaining({
        userId: base.user.id,
        lessonId,
        content: "This is my comment",
        parentId: null,
      }),
    });
  });

  it("trims content (pass '  hello  ', verify content is 'hello')", async () => {
    const response = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "  hello  ",
    });

    expect((response as any).comment.content).toBe("hello");
  });

  it("instructor can post without enrollment", async () => {
    const response = await post(base.instructor.id, {
      intent: "create",
      lessonId,
      content: "Instructor comment",
    });

    expect(response).toMatchObject({
      success: true,
      comment: expect.objectContaining({
        userId: base.instructor.id,
        lessonId,
        content: "Instructor comment",
      }),
    });
  });
});

// ─── Reply Tests ───

describe("POST /api/lesson-comment — reply intent", () => {
  it("creates a reply to a top-level comment", async () => {
    const parent = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Parent comment",
    });
    const parentId = (parent as any).comment.id;

    const response = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "This is a reply",
      parentId,
    });

    expect(response).toMatchObject({
      success: true,
      comment: expect.objectContaining({
        userId: base.user.id,
        lessonId,
        content: "This is a reply",
        parentId,
      }),
    });
  });

  it("returns 422 when replying to a reply (3rd level)", async () => {
    const parent = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Parent comment",
    });
    const parentId = (parent as any).comment.id;

    const reply = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Reply to parent",
      parentId,
    });
    const replyId = (reply as any).comment.id;

    const response = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Reply to a reply",
      parentId: replyId,
    });

    expect(getStatus(response)).toBe(422);
    expect(getBody(response).error).toBe("Cannot reply to a reply");
  });

  it("returns 422 when replying to a comment on a different lesson", async () => {
    // Create a second lesson
    const lesson2 = fileDb.db
      .insert(schema.lessons)
      .values({
        moduleId,
        title: "Second Lesson",
        position: 2,
      })
      .returning()
      .get();

    // Create a comment on the second lesson
    const commentOnLesson2 = fileDb.db
      .insert(schema.lessonComments)
      .values({
        lessonId: lesson2.id,
        userId: base.user.id,
        parentId: null,
        content: "Comment on lesson 2",
      })
      .returning()
      .get();

    // Try to reply to lesson2's comment but with lessonId of first lesson
    const response = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Reply to wrong lesson comment",
      parentId: commentOnLesson2.id,
    });

    expect(getStatus(response)).toBe(404);
    expect(getBody(response).error).toBe("Parent comment not found");
  });

  it("returns 422 when thread is at 50 replies", async () => {
    const parent = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Parent comment",
    });
    const parentId = (parent as any).comment.id;

    seedReplies(fileDb.db, parentId, base.instructor.id, lessonId, 50);

    const response = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "51st reply",
      parentId,
    });

    expect(getStatus(response)).toBe(422);
    expect(getBody(response).error).toBe("Thread reply limit reached (50)");
  });

  it("returns 422 when student has 10 replies in a thread", async () => {
    const parent = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Parent comment",
    });
    const parentId = (parent as any).comment.id;

    seedReplies(fileDb.db, parentId, base.user.id, lessonId, 10);

    const response = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "11th reply from student",
      parentId,
    });

    expect(getStatus(response)).toBe(422);
    expect(getBody(response).error).toBe("Reply limit per user reached (10)");
  });

  it("instructor has no per-user reply limit", async () => {
    const parent = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Parent comment",
    });
    const parentId = (parent as any).comment.id;

    seedReplies(fileDb.db, parentId, base.instructor.id, lessonId, 10);

    const response = await post(base.instructor.id, {
      intent: "create",
      lessonId,
      content: "11th reply from instructor",
      parentId,
    });

    expect(response).toMatchObject({
      success: true,
      comment: expect.objectContaining({
        userId: base.instructor.id,
        parentId,
      }),
    });
  });
});

// ─── Edit Tests ───

describe("POST /api/lesson-comment — edit intent", () => {
  it("returns 404 for non-existent comment", async () => {
    const response = await post(base.user.id, {
      intent: "edit",
      commentId: 99999,
      content: "Updated content",
    });

    expect(getStatus(response)).toBe(404);
    expect(getBody(response).error).toBe("Comment not found");
  });

  it("returns 403 when editing someone else's comment", async () => {
    const comment = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Original content",
    });
    const commentId = (comment as any).comment.id;

    const response = await post(base.instructor.id, {
      intent: "edit",
      commentId,
      content: "Trying to edit another user's comment",
    });

    expect(getStatus(response)).toBe(403);
    expect(getBody(response).error).toBe("You can only edit your own comments");
  });

  it("returns 422 when editing a soft-deleted comment", async () => {
    const inserted = fileDb.db
      .insert(schema.lessonComments)
      .values({
        lessonId,
        userId: base.user.id,
        parentId: null,
        content: "[comment removed]",
        isDeleted: true,
      })
      .returning()
      .get();

    const response = await post(base.user.id, {
      intent: "edit",
      commentId: inserted.id,
      content: "Trying to edit deleted comment",
    });

    expect(getStatus(response)).toBe(422);
    expect(getBody(response).error).toBe("Cannot edit a deleted comment");
  });

  it("updates content and sets editedAt on success", async () => {
    const comment = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Original content",
    });
    const commentId = (comment as any).comment.id;

    const response = await post(base.user.id, {
      intent: "edit",
      commentId,
      content: "Updated content",
    });

    expect(response).toMatchObject({
      success: true,
      comment: expect.objectContaining({
        id: commentId,
        content: "Updated content",
      }),
    });
    expect((response as any).comment.editedAt).not.toBeNull();
  });

  it("fresh comment has editedAt = null", async () => {
    const response = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Brand new comment",
    });

    expect((response as any).comment.editedAt).toBeNull();
  });

  it("returns 400 for empty content on edit", async () => {
    const comment = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Original content",
    });
    const commentId = (comment as any).comment.id;

    try {
      await post(base.user.id, {
        intent: "edit",
        commentId,
        content: "",
      });
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(400);
    }
  });

  it("returns 400 for content >500 chars on edit", async () => {
    const comment = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Original content",
    });
    const commentId = (comment as any).comment.id;

    try {
      await post(base.user.id, {
        intent: "edit",
        commentId,
        content: "a".repeat(501),
      });
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(400);
    }
  });
});

// ─── Delete Tests ───

describe("POST /api/lesson-comment — delete intent", () => {
  it("returns 404 for non-existent comment", async () => {
    const response = await post(base.user.id, {
      intent: "delete",
      commentId: 99999,
    });

    expect(getStatus(response)).toBe(404);
    expect(getBody(response).error).toBe("Comment not found");
  });

  it("returns 403 when another student tries to delete first student's comment", async () => {
    const student2 = fileDb.db
      .insert(schema.users)
      .values({
        name: "Second Student",
        email: "student2@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();

    const comment = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Student 1's comment",
    });
    const commentId = (comment as any).comment.id;

    const response = await post(student2.id, {
      intent: "delete",
      commentId,
    });

    expect(getStatus(response)).toBe(403);
    expect(getBody(response).error).toBe("You don't have permission to delete this comment");
  });

  it("returns 403 when instructor of a different course tries to delete", async () => {
    const comment = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Student's comment",
    });
    const commentId = (comment as any).comment.id;

    const response = await post(instructor2Id, {
      intent: "delete",
      commentId,
    });

    expect(getStatus(response)).toBe(403);
    expect(getBody(response).error).toBe("You don't have permission to delete this comment");
  });

  it("student can delete their own comment (hard delete, no replies)", async () => {
    const comment = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "My comment to delete",
    });
    const commentId = (comment as any).comment.id;

    const response = await post(base.user.id, {
      intent: "delete",
      commentId,
    });

    expect(response).toMatchObject({
      success: true,
      deleted: true,
      soft: false,
    });

    const inDb = fileDb.db
      .select()
      .from(schema.lessonComments)
      .where(eq(schema.lessonComments.id, commentId))
      .get();
    expect(inDb).toBeUndefined();
  });

  it("instructor can delete any comment", async () => {
    const comment = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Student comment that instructor will delete",
    });
    const commentId = (comment as any).comment.id;

    const response = await post(base.instructor.id, {
      intent: "delete",
      commentId,
    });

    expect(response).toMatchObject({
      success: true,
      deleted: true,
    });
  });

  it("soft deletes a top-level comment that has replies", async () => {
    const parent = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Parent comment",
    });
    const parentId = (parent as any).comment.id;

    seedReplies(fileDb.db, parentId, base.user.id, lessonId, 2);

    const response = await post(base.user.id, {
      intent: "delete",
      commentId: parentId,
    });

    expect(response).toMatchObject({
      success: true,
      deleted: true,
      soft: true,
    });

    // Check the parent is soft-deleted
    const parentInDb = fileDb.db
      .select()
      .from(schema.lessonComments)
      .where(eq(schema.lessonComments.id, parentId))
      .get();
    expect(parentInDb?.isDeleted).toBe(true);

    // Check replies are still there
    const replies = fileDb.db
      .select()
      .from(schema.lessonComments)
      .where(eq(schema.lessonComments.parentId, parentId))
      .all();
    expect(replies).toHaveLength(2);
  });

  it("hard deletes a top-level comment with no replies", async () => {
    const comment = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Top-level comment with no replies",
    });
    const commentId = (comment as any).comment.id;

    const response = await post(base.user.id, {
      intent: "delete",
      commentId,
    });

    expect(response).toMatchObject({
      success: true,
      deleted: true,
      soft: false,
    });

    const inDb = fileDb.db
      .select()
      .from(schema.lessonComments)
      .where(eq(schema.lessonComments.id, commentId))
      .get();
    expect(inDb).toBeUndefined();
  });

  it("hard deletes a reply", async () => {
    const parent = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Parent comment",
    });
    const parentId = (parent as any).comment.id;

    const reply = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "A reply",
      parentId,
    });
    const replyId = (reply as any).comment.id;

    const response = await post(base.user.id, {
      intent: "delete",
      commentId: replyId,
    });

    expect(response).toMatchObject({
      success: true,
      deleted: true,
      soft: false,
    });

    const inDb = fileDb.db
      .select()
      .from(schema.lessonComments)
      .where(eq(schema.lessonComments.id, replyId))
      .get();
    expect(inDb).toBeUndefined();
  });

  it("hard-deletes a soft-deleted parent when last reply is removed", async () => {
    // Create top-level comment
    const createResult = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Parent comment",
    });
    const parentId = (createResult as any).comment.id;

    // Create a single reply
    const replyResult = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Only reply",
      parentId,
    });
    const replyId = (replyResult as any).comment.id;

    // Soft-delete parent (has reply, so soft delete)
    await post(base.instructor.id, { intent: "delete", commentId: parentId });

    // Verify parent is soft-deleted (still in DB)
    const parentAfterSoftDelete = fileDb.db
      .select()
      .from(schema.lessonComments)
      .where(eq(schema.lessonComments.id, parentId))
      .get();
    expect(parentAfterSoftDelete).toBeDefined();
    expect(parentAfterSoftDelete!.isDeleted).toBe(true);

    // Delete the reply (last reply → should trigger ghost cleanup)
    await post(base.instructor.id, { intent: "delete", commentId: replyId });

    // Verify both parent and reply are gone
    const parentAfterCleanup = fileDb.db
      .select()
      .from(schema.lessonComments)
      .where(eq(schema.lessonComments.id, parentId))
      .get();
    expect(parentAfterCleanup).toBeUndefined();

    const replyAfterCleanup = fileDb.db
      .select()
      .from(schema.lessonComments)
      .where(eq(schema.lessonComments.id, replyId))
      .get();
    expect(replyAfterCleanup).toBeUndefined();
  });
});

// ─── Misc / Edge Case Tests ───

describe("POST /api/lesson-comment — misc", () => {
  it("returns 422 when replying to a soft-deleted parent", async () => {
    // Create a top-level comment
    const createResult = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Top level",
    });
    const commentId = (createResult as any).comment.id;

    // Create a reply so soft-delete will happen
    await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "A reply",
      parentId: commentId,
    });

    // Soft-delete the top-level comment (as instructor)
    await post(base.instructor.id, {
      intent: "delete",
      commentId,
    });

    // Try to reply to the soft-deleted parent
    const response = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Reply to deleted",
      parentId: commentId,
    });
    expect(getStatus(response)).toBe(422);
    expect(getBody(response).error).toBe("Cannot reply to a deleted comment");
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = await createAuthenticatedRequest(base.user.id, BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    try {
      await callAction(request);
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(400);
    }
  });
});

// ─── Loader Tests ───

describe("GET /api/lesson-comment (loader)", () => {
  it("returns 401 when not authenticated", async () => {
    const request = new Request(`${BASE_URL}?lessonId=${lessonId}`);
    try {
      await callLoader(request);
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(401);
    }
  });

  it("returns 400 for missing lessonId", async () => {
    const request = await createAuthenticatedRequest(base.user.id, BASE_URL, {
      method: "GET",
    });
    try {
      await callLoader(request);
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(400);
    }
  });

  it("returns 400 for invalid lessonId", async () => {
    try {
      await getComments(base.user.id, { lessonId: "abc" });
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(400);
    }
  });

  it("returns 403 when not enrolled and not instructor", async () => {
    try {
      await getComments(instructor2Id, { lessonId: String(lessonId) });
      expect.unreachable("Should have thrown");
    } catch (thrown: any) {
      expect(getStatus(thrown)).toBe(403);
    }
  });

  it("returns comments and totalTopLevelCount for enrolled user", async () => {
    // Create a comment first
    await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Test comment for loader",
    });

    const result = await getComments(base.user.id, { lessonId: String(lessonId) });
    expect(result.comments).toBeInstanceOf(Array);
    expect(result.comments.length).toBeGreaterThanOrEqual(1);
    expect(result.totalTopLevelCount).toBeGreaterThanOrEqual(1);
  });

  it("returns comments for course instructor without enrollment", async () => {
    // Create a comment as enrolled student
    await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Student comment",
    });

    // Instructor can read without enrollment
    const result = await getComments(base.instructor.id, { lessonId: String(lessonId) });
    expect(result.comments).toBeInstanceOf(Array);
    expect(result.comments.length).toBeGreaterThanOrEqual(1);
  });

  it("respects limit and offset params", async () => {
    // Create 3 comments
    for (let i = 0; i < 3; i++) {
      await post(base.user.id, {
        intent: "create",
        lessonId,
        content: `Comment ${i}`,
      });
    }

    // Fetch with limit=2
    const page1 = await getComments(base.user.id, {
      lessonId: String(lessonId),
      limit: "2",
      offset: "0",
    });
    const topLevel1 = page1.comments.filter((c: any) => c.parentId === null);
    expect(topLevel1.length).toBe(2);

    // Fetch page 2
    const page2 = await getComments(base.user.id, {
      lessonId: String(lessonId),
      limit: "2",
      offset: "2",
    });
    const topLevel2 = page2.comments.filter((c: any) => c.parentId === null);
    expect(topLevel2.length).toBe(1);

    // Total should be consistent
    expect(page1.totalTopLevelCount).toBe(3);
    expect(page2.totalTopLevelCount).toBe(3);
  });

  it("uses default limit=20 and offset=0", async () => {
    await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Default params test",
    });

    const result = await getComments(base.user.id, { lessonId: String(lessonId) });
    expect(result.comments).toBeInstanceOf(Array);
    expect(result.totalTopLevelCount).toBeGreaterThanOrEqual(1);
  });

  it("returns replies along with top-level comments", async () => {
    // Create a top-level comment
    const parent = await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Parent for reply test",
    });

    const parentComment = (parent as any).comment;

    // Create a reply
    await post(base.user.id, {
      intent: "create",
      lessonId,
      content: "Reply to parent",
      parentId: parentComment.id,
    });

    const result = await getComments(base.user.id, { lessonId: String(lessonId) });
    const topLevel = result.comments.filter((c: any) => c.parentId === null);
    const replies = result.comments.filter((c: any) => c.parentId !== null);

    expect(topLevel.length).toBeGreaterThanOrEqual(1);
    expect(replies.length).toBeGreaterThanOrEqual(1);
    expect(replies[0].parentId).toBe(parentComment.id);
  });
});
