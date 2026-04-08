CREATE TABLE "university_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}',
	"country" text NOT NULL,
	"domesticTag" text,
	"qsRank" integer,
	"tier" text NOT NULL,
	"updatedYear" integer DEFAULT 2025 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "university" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "universityTier" text;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "locale" text DEFAULT 'zh' NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "educationScore" real DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "university_tiers_name_idx" ON "university_tiers" USING btree ("name");