ALTER TABLE "artifact" DROP CONSTRAINT "artifact_person_id_person_id_fk";
--> statement-breakpoint
ALTER TABLE "artifact" DROP CONSTRAINT "artifact_organisation_id_organisation_id_fk";
--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE restrict ON UPDATE no action;