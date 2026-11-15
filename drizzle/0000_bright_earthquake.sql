CREATE TABLE `lumen_chunks` (
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`part` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`owner`, `revision`, `part`),
	FOREIGN KEY (`owner`) REFERENCES `lumen_heads`(`owner`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lumen_heads` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lumen_heads_revision_nonnegative" CHECK("lumen_heads"."revision" >= 0)
);
