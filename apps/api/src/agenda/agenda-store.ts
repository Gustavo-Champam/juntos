import type {
  AgendaEvent,
  CreateAgendaRequest,
  DeleteAgendaRequest,
  SpaceMember,
  UpdateAgendaRequest,
} from "@juntos/contracts";

export type AgendaRows = {
  revision: string;
  events: AgendaEvent[];
  members: SpaceMember[];
};

export interface AgendaStore {
  read(userId: string): Promise<AgendaRows>;
  create(userId: string, input: CreateAgendaRequest): Promise<AgendaEvent>;
  update(userId: string, id: string, input: UpdateAgendaRequest): Promise<AgendaEvent>;
  delete(userId: string, id: string, input: DeleteAgendaRequest): Promise<AgendaEvent>;
}

export class AgendaVersionConflict extends Error {
  constructor(readonly current: AgendaEvent) {
    super("agenda version conflict");
    this.name = "AgendaVersionConflict";
  }
}

export class AgendaInputError extends Error {
  readonly status = 400;

  constructor() {
    super("invalid agenda input");
    this.name = "AgendaInputError";
  }
}
