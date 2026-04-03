PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_lesson_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lesson_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`parent_id` integer,
	`content` text NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`edited_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_lesson_comments`("id", "lesson_id", "user_id", "parent_id", "content", "is_deleted", "edited_at", "created_at") SELECT "id", "lesson_id", "user_id", "parent_id", "content", "is_deleted", "edited_at", "created_at" FROM `lesson_comments`;--> statement-breakpoint
DROP TABLE `lesson_comments`;--> statement-breakpoint
ALTER TABLE `__new_lesson_comments` RENAME TO `lesson_comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `lesson_comments_lesson_created_idx` ON `lesson_comments` (`lesson_id`,`created_at`);