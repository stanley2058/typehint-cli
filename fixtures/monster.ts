// A deliberately large "builder type" fixture to exercise:
// - deep unions
// - conditional types
// - self references
// - alias preservation

export type AuditActorUser = {
  kind: "user";
  actorId: string;
};

export type AuditActorGroup = {
  kind: "group";
  actorId: string;
};

export type AuditActor = AuditActorUser | AuditActorGroup;

export type AuditResDoc = {
  resKind: "doc";
  resId: string;
};
export type AuditResLabel = {
  resKind: "label";
  resId: string;
  subKind: "label";
};
export type AuditResSpace = {
  resKind: "space";
  resId: string;
};

export type AuditResource = AuditResDoc | AuditResLabel | AuditResSpace;

export type AuditSubMeta = {
  subKind: "meta";
  subId: string;
};
export type AuditSubLabel = {
  subKind: "label";
  subId: string;
};
export type AuditSubResource = AuditSubMeta | AuditSubLabel;

export type AuditActionCreate = {
  action: "create";
  prev: null;
  next: Record<string, string>;
};
export type AuditActionUpdate = {
  action: "update";
  prev: Record<string, string>;
  next: Record<string, string>;
};
export type AuditActionAttach = {
  action: "attach";
  prev: Record<string, string>;
  next: Record<string, string>;
};
export type AuditActionDelete = {
  action: "delete";
  prev: Record<string, string>;
  next: null;
};

export type AuditAction =
  | AuditActionCreate
  | AuditActionUpdate
  | AuditActionAttach
  | AuditActionDelete;

export type AuditCommon = {
  kind: "user" | "group";
  actorId: string;
  resKind: "doc" | "label" | "space";
  resId: string;
  subKind: "meta" | "label";
  subId: string;
  action: AuditAction["action"];
  prev: Record<string, string> | null;
  next: Record<string, string> | null;
  origin?: "api" | "job" | null;
  operatorId: string;
};

type AuditBase = Omit<AuditCommon, "action" | "prev" | "next">;

export type AuditLog = AuditBase & AuditAction;

export type AuditLogResponse = AuditLog & {
  id: string;
  operator: { displayName: string };
  createdAt: string;
  updatedAt: string;
};

type BuilderState = {
  actor: boolean;
  resource: boolean;
  subResource: boolean;
  action: boolean;
  operator: boolean;
};

type EmptyState = {
  actor: false;
  resource: false;
  subResource: false;
  action: false;
  operator: false;
};

type SetFlag<S extends BuilderState, K extends keyof BuilderState> = Omit<S, K> & {
  [P in K]: true;
};

type MissingFields<S extends BuilderState> = (S["actor"] extends true
  ? {}
  : Pick<AuditCommon, "kind" | "actorId">) &
  (S["resource"] extends true ? {} : Pick<AuditCommon, "resKind" | "resId">) &
  (S["subResource"] extends true
    ? {}
    : Pick<AuditCommon, "subKind" | "subId">) &
  (S["action"] extends true ? {} : AuditAction) &
  (S["operator"] extends true ? {} : Pick<AuditCommon, "operatorId">);

type Draft = Partial<AuditCommon>;

export class AuditLogBuilder<S extends BuilderState = EmptyState> {
  private draft: Draft;

  static of(initialValue: Draft = {}): AuditLogBuilder<EmptyState> {
    return new AuditLogBuilder(initialValue);
  }

  private constructor(initialValue: Draft) {
    this.draft = initialValue;
  }

  build(): Draft {
    return this.draft;
  }

  buildWith(rest: MissingFields<S> & Draft): AuditLog {
    return this.mergeWith<BuilderState>(rest).build() as unknown as AuditLog;
  }

  set(value: Draft): AuditLogBuilder<S> {
    return this.mergeWith<S>(value);
  }

  actor(value: AuditActor): AuditLogBuilder<SetFlag<S, "actor">> {
    return this.mergeWith<SetFlag<S, "actor">>(value);
  }

  resource(value: AuditResource): AuditLogBuilder<SetFlag<S, "resource">> {
    return this.mergeWith<SetFlag<S, "resource">>(value);
  }

  subResource(value: AuditSubResource): AuditLogBuilder<SetFlag<S, "subResource">> {
    return this.mergeWith<SetFlag<S, "subResource">>(value);
  }

  action(value: AuditAction): AuditLogBuilder<SetFlag<S, "action">> {
    return this.mergeWith<SetFlag<S, "action">>(value);
  }

  operator(operatorId: string): AuditLogBuilder<SetFlag<S, "operator">> {
    return this.mergeWith<SetFlag<S, "operator">>({ operatorId });
  }

  private mergeWith<NextState extends BuilderState>(value: Draft): AuditLogBuilder<NextState> {
    return new AuditLogBuilder({ ...this.draft, ...value }) as unknown as AuditLogBuilder<NextState>;
  }
}

export class AuditLogger {
  static log(activity: AuditLog): void;
  static log(builderFn: (b: AuditLogBuilder) => AuditLog, origin?: AuditCommon["origin"]): void;
  static log(
    activityOrBuilderFn: AuditLog | ((b: AuditLogBuilder) => AuditLog),
    origin?: AuditCommon["origin"],
  ): void {
    void origin;
    void activityOrBuilderFn;
  }
}

export const built = AuditLogBuilder.of({ origin: "api" })
  .actor({ kind: "user", actorId: "u" })
  .resource({ resKind: "doc", resId: "d" })
  .subResource({ subKind: "meta", subId: "m" })
  .action({ action: "update", prev: { title: "old" }, next: { title: "new" } })
  .operator("u")
  .buildWith({});

// Hover target: buildWith
AuditLogBuilder.of({}).buildWith;
