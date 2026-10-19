import {postgresTrajectoryStore} from '../relationships/trajectory-store';
import {postgresCareerStore} from '../relationships/career';
import type postgres from "postgres";
import type { ReviewDependencies } from "./handler";
import { postgresReviewStore } from "./postgres-rejection";
import { postgresArchiveStore } from "./postgres-archive";
import { postgresPersonArchiveStore } from "./postgres-person-archive";
import { postgresIdentityStore } from "../identity/postgres-confirmation";
import { postgresRejectionStore } from "../identity/postgres-rejection";
import {postgresIdentityReassignmentStore} from '../identity/postgres-reassignment';
import {postgresAuthorshipStore} from '../relationships/authorship';
import {postgresConceptAssociationStore} from '../relationships/concept-association';

/** Shared supplied app pool. Construction performs no writes or background processing. */
export function postgresReviewDependencies(connection: ReturnType<typeof postgres>): ReviewDependencies {
  return { trajectory:postgresTrajectoryStore(connection),career:postgresCareerStore(connection),observations: postgresReviewStore(connection), observationArchive: postgresArchiveStore(connection),
    personArchive: postgresPersonArchiveStore(connection), identities: postgresIdentityStore(connection),
    identityRejection: postgresRejectionStore(connection),personCreation:postgresIdentityStore(connection),
    identityReassignment:postgresIdentityReassignmentStore(connection),authorship:postgresAuthorshipStore(connection),conceptAssociation:postgresConceptAssociationStore(connection) };
}
