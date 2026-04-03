import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { MessageSquare, Edit2, Trash2, ChevronDown, ChevronUp, Reply } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { UserAvatar } from "~/components/user-avatar";
import { cn, formatRelativeTime } from "~/lib/utils";

type Comment = {
  id: number;
  userId: number | null;
  parentId: number | null;
  content: string;
  isDeleted: boolean;
  editedAt: string | null;
  createdAt: string;
  userName: string;
  userAvatarUrl: string | null;
};

type CommentsProps = {
  lessonId: number;
  courseInstructorId: number;
  currentUserId: number;
  comments: Comment[];
  totalTopLevelCount: number;
  isInstructor: boolean;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InstructorBadge() {
  return (
    <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
      Instructor
    </span>
  );
}

function CharCounter({ count }: { count: number }) {
  const isOver = count > 500;
  return (
    <span
      role="status"
      aria-label={`${count} of 500 characters used${isOver ? ", over limit" : ""}`}
      className={cn(
        "text-xs",
        isOver ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {count}/500{isOver && " (over limit)"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// New comment form (bottom of section)
// ---------------------------------------------------------------------------

function NewCommentForm({ lessonId }: { lessonId: number }) {
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const [content, setContent] = useState("");
  const [hasEdited, setHasEdited] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const isSubmitting = fetcher.state !== "idle";

  // Clear on success
  useEffect(() => {
    if (fetcher.data?.success) {
      setContent("");
      setShowSuccess(true);
      setHasEdited(false);
      const timer = setTimeout(() => setShowSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.data?.success]);

  function handleSubmit() {
    if (!content.trim() || content.length > 500) return;
    setHasEdited(false);
    fetcher.submit(
      JSON.stringify({ intent: "create", lessonId, content, parentId: null }),
      { method: "POST", action: "/api/lesson-comment", encType: "application/json" }
    );
  }

  return (
    <div className="mt-6 space-y-2">
      <Textarea
        aria-label="Add a comment"
        placeholder="Add a comment…"
        value={content}
        onChange={(e) => { setContent(e.target.value); setHasEdited(true); }}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit(); }}
        disabled={isSubmitting}
        className="resize-none"
      />
      <div className="flex items-center justify-between">
        {content.length > 0 ? <CharCounter count={content.length} /> : <span />}
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting || !content.trim() || content.length > 500}
        >
          {isSubmitting ? "Posting…" : "Post"}
        </Button>
      </div>
      {content.length > 500 && (
        <p className="text-sm text-destructive" role="alert">Comment exceeds the 500-character limit.</p>
      )}
      {fetcher.data?.error && !hasEdited && (
        <p className="text-sm text-destructive" role="alert">{fetcher.data.error}</p>
      )}
      {showSuccess && (
        <p className="text-sm text-primary" role="status">Comment posted</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reply form (inline, shown after clicking Reply)
// ---------------------------------------------------------------------------

function ReplyForm({
  lessonId,
  parentId,
  replyingToName,
  onCancel,
}: {
  lessonId: number;
  parentId: number;
  replyingToName: string;
  onCancel: () => void;
}) {
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const [content, setContent] = useState("");
  const [hasEdited, setHasEdited] = useState(false);
  const isSubmitting = fetcher.state !== "idle";

  // Stable ref for onCancel to avoid stale closure
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Clear and close on success
  useEffect(() => {
    if (fetcher.data?.success) {
      setContent("");
      setHasEdited(false);
      onCancelRef.current();
    }
  }, [fetcher.data?.success]);

  function handleSubmit() {
    if (!content.trim() || content.length > 500) return;
    setHasEdited(false);
    fetcher.submit(
      JSON.stringify({ intent: "create", lessonId, content, parentId }),
      { method: "POST", action: "/api/lesson-comment", encType: "application/json" }
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <Textarea
        aria-label={`Write a reply to ${replyingToName}`}
        placeholder={`Reply to ${replyingToName}…`}
        value={content}
        onChange={(e) => { setContent(e.target.value); setHasEdited(true); }}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit(); }}
        disabled={isSubmitting}
        className="resize-none"
      />
      <div className="flex items-center justify-between">
        {content.length > 0 ? <CharCounter count={content.length} /> : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => onCancelRef.current()} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !content.trim() || content.length > 500}
          >
            {isSubmitting ? "Replying…" : "Reply"}
          </Button>
        </div>
      </div>
      {content.length > 500 && (
        <p className="text-sm text-destructive" role="alert">Reply exceeds the 500-character limit.</p>
      )}
      {fetcher.data?.error && !hasEdited && (
        <p className="text-sm text-destructive" role="alert">{fetcher.data.error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit form (inline, replaces content paragraph)
// ---------------------------------------------------------------------------

function EditForm({
  comment,
  onCancel,
}: {
  comment: Comment;
  onCancel: () => void;
}) {
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const [content, setContent] = useState(comment.content);
  const [hasEdited, setHasEdited] = useState(false);
  const isSubmitting = fetcher.state !== "idle";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Stable ref for onCancel to avoid stale closure
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Focus textarea on mount
  useEffect(() => { textareaRef.current?.focus(); }, []);

  useEffect(() => {
    if (fetcher.data?.success) {
      onCancelRef.current();
    }
  }, [fetcher.data?.success]);

  function handleSave() {
    if (!content.trim() || content.length > 500) return;
    setHasEdited(false);
    fetcher.submit(
      JSON.stringify({ intent: "edit", commentId: comment.id, content }),
      { method: "POST", action: "/api/lesson-comment", encType: "application/json" }
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        ref={textareaRef}
        aria-label="Edit your comment"
        value={content}
        onChange={(e) => { setContent(e.target.value); setHasEdited(true); }}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSave(); }}
        disabled={isSubmitting}
        className="resize-none"
      />
      <div className="flex items-center justify-between">
        {content.length > 0 ? <CharCounter count={content.length} /> : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => onCancelRef.current()} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSubmitting || !content.trim() || content.length > 500}
          >
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {content.length > 500 && (
        <p className="text-sm text-destructive" role="alert">Comment exceeds the 500-character limit.</p>
      )}
      {fetcher.data?.error && !hasEdited && (
        <p className="text-sm text-destructive" role="alert">{fetcher.data.error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete button with inline confirmation
// ---------------------------------------------------------------------------

function DeleteButton({
  commentId,
  hasReplies,
}: {
  commentId: number;
  hasReplies: boolean;
}) {
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function handleConfirm() {
    fetcher.submit(
      JSON.stringify({ intent: "delete", commentId }),
      { method: "POST", action: "/api/lesson-comment", encType: "application/json" }
    );
    setConfirming(false);
  }

  return (
    <div className="inline-flex flex-col">
      {confirming ? (
        <span className="flex items-center gap-2 text-xs text-muted-foreground max-w-xs flex-wrap">
          {hasReplies
            ? "Delete this comment? Replies will be preserved."
            : "Are you sure?"}
          <Button
            ref={confirmRef}
            size="sm"
            variant="destructive"
            onClick={handleConfirm}
            onKeyDown={(e) => { if (e.key === "Escape") setConfirming(false); }}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(false)}
            onKeyDown={(e) => { if (e.key === "Escape") setConfirming(false); }}
          >
            Cancel
          </Button>
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => setConfirming(true)}
          aria-label="Delete comment"
        >
          <Trash2 className="size-3 mr-1" aria-hidden="true" />
          Delete
        </Button>
      )}
      {fetcher.data?.error && (
        <p className="text-sm text-destructive mt-1" role="alert">{fetcher.data.error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single comment row — self-contained, manages its own reply + edit state
// ---------------------------------------------------------------------------

function CommentRow({
  comment,
  replies,
  lessonId,
  courseInstructorId,
  currentUserId,
  isInstructor,
}: {
  comment: Comment;
  replies: Comment[];
  lessonId: number;
  courseInstructorId: number;
  currentUserId: number;
  isInstructor: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replyFormOpen, setReplyFormOpen] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Return focus to Edit button when edit form closes
  useEffect(() => {
    if (wasEditing.current && !editing) {
      editButtonRef.current?.focus({ preventScroll: true });
    }
    wasEditing.current = editing;
  }, [editing]);

  const isOwn = comment.userId === currentUserId;
  const isCommentInstructor = comment.userId === courseInstructorId;
  const canEdit = isOwn && !comment.isDeleted;
  const canDelete = (isOwn || isInstructor) && !comment.isDeleted;
  const isTopLevel = comment.parentId === null;

  return (
    <>
      <article
        className={cn(
          "flex gap-3",
          isCommentInstructor && "bg-primary/5 rounded-md p-2"
        )}
      >
        {/* Avatar */}
        <UserAvatar
          name={comment.userName}
          avatarUrl={comment.userAvatarUrl}
          className="size-8 shrink-0 mt-0.5"
        />

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium max-w-[12rem] truncate">{comment.userName}</span>
            {isCommentInstructor && <InstructorBadge />}
            <time
              dateTime={comment.createdAt}
              title={comment.createdAt}
              className="text-xs text-muted-foreground"
            >
              {formatRelativeTime(comment.createdAt)}
            </time>
            {comment.editedAt && (
              <span className="text-xs text-muted-foreground italic">· edited</span>
            )}
          </div>

          {/* Content or edit form */}
          {editing ? (
            <EditForm comment={comment} onCancel={() => setEditing(false)} />
          ) : comment.isDeleted ? (
            <p className="text-sm text-muted-foreground italic">[comment removed]</p>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {comment.content}
            </p>
          )}

          {/* Action row — hide for deleted */}
          {!comment.isDeleted && !editing && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              {canEdit && (
                <Button
                  ref={editButtonRef}
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setEditing(true)}
                  aria-label="Edit your comment"
                >
                  <Edit2 className="size-3 mr-1" aria-hidden="true" />
                  Edit
                </Button>
              )}
              {canDelete && (
                <DeleteButton commentId={comment.id} hasReplies={replies.length > 0} />
              )}
              {isTopLevel && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => { setShowReplies(true); setReplyFormOpen(true); }}
                  aria-label="Reply to comment"
                >
                  <Reply className="size-3 mr-1" aria-hidden="true" />
                  Reply
                </Button>
              )}
            </div>
          )}
        </div>
      </article>

      {/* Replies — only on top-level comments, toggled */}
      {isTopLevel && replies.length > 0 && (
        <button
          className="mt-2 ml-4 sm:ml-8 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          onClick={() => setShowReplies((v) => { if (v) setReplyFormOpen(false); return !v; })}
          aria-expanded={showReplies}
          aria-label={showReplies ? `Hide replies` : `Show replies`}
        >
          {showReplies ? (
            <ChevronUp className="size-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3" aria-hidden="true" />
          )}
          {showReplies
            ? `Hide ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`
            : `Show ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
        </button>
      )}
      {isTopLevel && showReplies && (replies.length > 0 || replyFormOpen) && (
        <ul className="ml-4 sm:ml-8 pl-4 border-l-2 border-border space-y-4 list-none p-0 mt-2">
          {replies.map((reply) => (
            <li key={reply.id}>
              <CommentRow
                comment={reply}
                replies={[]}
                lessonId={lessonId}
                courseInstructorId={courseInstructorId}
                currentUserId={currentUserId}
                isInstructor={isInstructor}
              />
            </li>
          ))}
          {replyFormOpen && (
            <li>
              <ReplyForm
                lessonId={lessonId}
                parentId={comment.id}
                replyingToName={comment.userName}
                onCancel={() => setReplyFormOpen(false)}
              />
            </li>
          )}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function CommentsSection({
  lessonId,
  courseInstructorId,
  currentUserId,
  comments,
  totalTopLevelCount,
  isInstructor,
}: CommentsProps) {
  const [extraComments, setExtraComments] = useState<Comment[]>([]);
  const [serverTotal, setServerTotal] = useState(totalTopLevelCount);
  const loadMoreFetcher = useFetcher<{ comments: Comment[]; totalTopLevelCount: number }>();

  // Sync serverTotal from prop on revalidation
  useEffect(() => {
    setServerTotal(totalTopLevelCount);
  }, [totalTopLevelCount]);

  // Handle load more fetcher response
  useEffect(() => {
    if (loadMoreFetcher.data?.comments) {
      setExtraComments((prev) => [...prev, ...loadMoreFetcher.data!.comments]);
      setServerTotal(loadMoreFetcher.data!.totalTopLevelCount);
    }
  }, [loadMoreFetcher.data]);

  // Deduplicate extra comments when server data changes (revalidation)
  useEffect(() => {
    const serverIds = new Set(comments.map(c => c.id));
    setExtraComments(prev => prev.filter(c => !serverIds.has(c.id)));
  }, [comments]);

  // Group into threads
  const allComments = [...comments, ...extraComments];
  const topLevel = allComments.filter((c) => c.parentId === null);
  const repliesByParent = new Map<number, Comment[]>();
  allComments
    .filter((c) => c.parentId !== null)
    .forEach((c) => {
      const arr = repliesByParent.get(c.parentId!) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentId!, arr);
    });

  return (
    <section aria-labelledby="comments-heading" className="mt-8 border-t pt-8">
      {/* Section header */}
      <h3 id="comments-heading" className="mb-6 flex items-center gap-2 text-lg font-semibold">
        <MessageSquare className="size-5" aria-hidden="true" />
        Comments ({serverTotal})
      </h3>

      {/* Comment list */}
      {serverTotal > 0 ? (
        <ul className="space-y-6 list-none p-0">
          {topLevel.map((comment) => (
            <li key={comment.id}>
              <CommentRow
                comment={comment}
                replies={repliesByParent.get(comment.id) ?? []}
                lessonId={lessonId}
                courseInstructorId={courseInstructorId}
                currentUserId={currentUserId}
                isInstructor={isInstructor}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <MessageSquare className="size-8 opacity-50" aria-hidden="true" />
          <p className="text-sm">Be the first to comment on this lesson.</p>
        </div>
      )}

      {/* Load more */}
      {serverTotal > topLevel.length && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadMoreFetcher.load(
                `/api/lesson-comment?lessonId=${lessonId}&limit=20&offset=${topLevel.length}`
              );
            }}
            disabled={loadMoreFetcher.state !== "idle"}
          >
            {loadMoreFetcher.state !== "idle" ? "Loading…" : "Load more comments"}
          </Button>
        </div>
      )}

      {/* New comment form */}
      <NewCommentForm lessonId={lessonId} />
    </section>
  );
}
