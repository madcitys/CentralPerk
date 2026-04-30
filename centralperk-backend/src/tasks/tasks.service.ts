import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LocalRuntimeService } from "../local-runtime/local-runtime.service";
import { PointsService } from "../points/points.service";
import { cleanString, nowIso, numberValue } from "../common/utils";

@Injectable()
export class TasksService {
  constructor(
    private readonly runtime: LocalRuntimeService,
    private readonly points: PointsService,
  ) {}

  async list(memberId?: string) {
    const state = await this.runtime.read();
    return (state.tasks || []).map((task) => {
      const progress = memberId
        ? state.taskProgress.find((row) => row.taskId === task.id && row.memberId === memberId)
        : null;
      return {
        ...task,
        memberStatus: progress?.status || "available",
      };
    });
  }

  async start(taskId: string, input: Record<string, unknown>) {
    const memberId = cleanString(input.memberId) || cleanString(input.memberIdentifier);
    if (!memberId) throw new BadRequestException("memberId is required.");

    return this.runtime.update((state) => {
      const task = state.tasks.find((row) => row.id === taskId);
      if (!task) throw new NotFoundException("Task not found.");
      const existing = state.taskProgress.find((row) => row.taskId === taskId && row.memberId === memberId);
      if (existing?.status === "completed" || existing?.status === "already_claimed") {
        return { taskId, memberId, status: "already_claimed" as const };
      }
      if (existing) {
        existing.status = "in_progress";
        existing.startedAt = existing.startedAt || nowIso();
      } else {
        state.taskProgress.push({
          taskId,
          memberId,
          status: "in_progress",
          startedAt: nowIso(),
        });
      }
      return { taskId, memberId, status: "in_progress" as const };
    });
  }

  async submit(taskId: string, input: Record<string, unknown>) {
    const memberId = cleanString(input.memberId) || cleanString(input.memberIdentifier);
    const fallbackEmail = cleanString(input.email) || cleanString(input.fallbackEmail) || undefined;
    if (!memberId) throw new BadRequestException("memberId is required.");

    return this.runtime.update(async (state) => {
      let task = state.tasks.find((row) => row.id === taskId);
      if (!task) {
        task = {
          id: taskId,
          title: cleanString(input.title) || "Survey Task",
          description: cleanString(input.description) || "Dynamic survey task",
          type: cleanString(input.type) === "task" ? "task" : "survey",
          status: "available",
          points: Math.max(1, Math.floor(numberValue(input.points, 50))),
          oncePerMember: input.oncePerMember !== false,
          requiredFields: Array.isArray(input.requiredFields)
            ? input.requiredFields.map((field) => String(field))
            : ["rating", "feedback"],
        };
        state.tasks.push(task);
      }

      const answers = (input.answers && typeof input.answers === "object" ? input.answers : {}) as Record<string, string>;
      for (const field of task.requiredFields || []) {
        if (!cleanString(answers[field])) {
          throw new BadRequestException(`Missing required field: ${field}`);
        }
      }

      const existing = state.taskProgress.find((row) => row.taskId === taskId && row.memberId === memberId);
      if (task.oncePerMember && (existing?.status === "completed" || existing?.status === "already_claimed")) {
        throw new BadRequestException("Task already claimed.");
      }

      const award = await this.points.applyAwardToState(state, {
        memberIdentifier: memberId,
        fallbackEmail,
        points: task.points,
        transactionType: "EARN",
        reason: `Task completed (${task.id}): ${task.title}`,
      }, `task-${task.id}-${memberId}`);

      if (existing) {
        existing.status = "completed";
        existing.submittedAt = nowIso();
        existing.answers = answers;
      } else {
        state.taskProgress.push({
          taskId,
          memberId,
          status: "completed",
          startedAt: nowIso(),
          submittedAt: nowIso(),
          answers,
        });
      }

      const profile = state.members[memberId];
      if (profile && task.type === "survey") {
        profile.surveysCompleted = Number(profile.surveysCompleted || 0) + 1;
      }

      return {
        taskId,
        memberId,
        status: "completed" as const,
        award,
      };
    });
  }
}
