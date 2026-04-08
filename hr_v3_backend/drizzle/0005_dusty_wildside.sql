ALTER TABLE "candidates" ADD COLUMN "age" integer;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "educationLevel" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "major" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "workYears" integer;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "relocationWilling" boolean;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "scoringWeights" jsonb DEFAULT '{"must":0.5,"nice":0.2,"education":0.2,"reject":0.1}'::jsonb NOT NULL;