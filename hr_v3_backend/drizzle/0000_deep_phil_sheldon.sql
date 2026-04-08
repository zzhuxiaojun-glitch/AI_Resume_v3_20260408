CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"positionId" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"education" text,
	"skills" text[],
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"department" text,
	"description" text,
	"skillConfig" jsonb DEFAULT '{"must":[],"nice":[],"reject":[]}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidateId" uuid NOT NULL,
	"fileName" text NOT NULL,
	"mimeType" text,
	"rawText" text,
	"source" text DEFAULT 'upload' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidateId" uuid NOT NULL,
	"positionId" uuid NOT NULL,
	"totalScore" real NOT NULL,
	"mustScore" real DEFAULT 0 NOT NULL,
	"niceScore" real DEFAULT 0 NOT NULL,
	"rejectPenalty" real DEFAULT 0 NOT NULL,
	"grade" text NOT NULL,
	"matchedSkills" text[] DEFAULT '{}' NOT NULL,
	"missingSkills" text[] DEFAULT '{}' NOT NULL,
	"explanation" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_candidateId_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_candidateId_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_positionId_positions_id_fk" FOREIGN KEY ("positionId") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidates_position_idx" ON "candidates" USING btree ("positionId");--> statement-breakpoint
CREATE INDEX "scores_candidate_idx" ON "scores" USING btree ("candidateId");--> statement-breakpoint
CREATE INDEX "scores_position_idx" ON "scores" USING btree ("positionId");