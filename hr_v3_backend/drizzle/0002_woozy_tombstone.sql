CREATE TABLE "email_process_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"messageId" text NOT NULL,
	"imapUid" integer,
	"senderEmail" text,
	"subject" text,
	"classification" text NOT NULL,
	"classificationReason" text,
	"status" text NOT NULL,
	"hasResumeAttachment" boolean DEFAULT false NOT NULL,
	"candidateId" uuid,
	"error" text,
	"processedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_process_logs_messageId_unique" UNIQUE("messageId")
);
--> statement-breakpoint
ALTER TABLE "email_process_logs" ADD CONSTRAINT "email_process_logs_candidateId_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_process_logs_message_id_idx" ON "email_process_logs" USING btree ("messageId");--> statement-breakpoint
CREATE INDEX "email_process_logs_status_idx" ON "email_process_logs" USING btree ("status");