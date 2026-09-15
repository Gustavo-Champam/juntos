import type { FastifyPluginAsync } from "fastify";

import {
  HouseholdInputError,
  type HouseholdService,
} from "../household/household-service.js";
import { AssistantService } from "../household/assistant.js";
import type { AgendaService } from "../agenda/agenda-service.js";
import { SharedDataError } from "../spaces/member-transaction.js";
import {
  authenticateSession,
  sendRequestFailure,
  type InternalRouteDependencies,
} from "./internal-auth.js";

export type HouseholdRouteDependencies = InternalRouteDependencies & {
  householdService: HouseholdService;
  agendaService?: AgendaService;
};

function statusOf(error: unknown): number {
  if (error instanceof HouseholdInputError) return 400;
  if (error instanceof SharedDataError) return error.status;
  return 502;
}

const internalHouseholdRoutes: FastifyPluginAsync<HouseholdRouteDependencies> = async (
  app,
  dependencies,
) => {
  async function withUser(
    request: Parameters<typeof authenticateSession>[0],
    reply: Parameters<typeof authenticateSession>[1],
  ) {
    return authenticateSession(request, reply, dependencies.sessionService);
  }

  app.post("/meals/list", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = (request.body ?? {}) as { from?: string; to?: string };
    try {
      await reply.send(await dependencies.householdService.listMeals(authenticated.user.id, String(body.from ?? ""), String(body.to ?? "")));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/meals/save", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = request.body as {
      date: string;
      mealType: "breakfast" | "lunch" | "dinner";
      recipeId?: string | null;
      title?: string;
      weekStart: string;
      time?: string;
    };
    try {
      await reply.send(await dependencies.householdService.saveMeal(authenticated.user.id, body));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/meals/clear", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = request.body as { date: string; mealType: "breakfast" | "lunch" | "dinner"; weekStart: string };
    try {
      await reply.send(await dependencies.householdService.clearMeal(authenticated.user.id, body));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/shopping/list", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = (request.body ?? {}) as { weekStart?: string };
    try {
      await reply.send(await dependencies.householdService.listShopping(authenticated.user.id, String(body.weekStart ?? "")));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/shopping/add", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = request.body as {
      weekStart: string;
      name: string;
      quantity: string;
      category: "hortifruti" | "mercearia" | "carnes" | "laticinios" | "outros";
    };
    try {
      await reply.send(await dependencies.householdService.addShoppingItem(authenticated.user.id, body));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/shopping/toggle", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = request.body as { id: string; checked: boolean };
    try {
      await reply.send(await dependencies.householdService.toggleShoppingItem(authenticated.user.id, body));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/shopping/remove", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = request.body as { id: string };
    try {
      await reply.send(await dependencies.householdService.removeShoppingItem(authenticated.user.id, body.id));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/shopping/from-recipe", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = request.body as { weekStart: string; recipeId: string };
    try {
      await reply.send(await dependencies.householdService.addRecipeIngredients(authenticated.user.id, body));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/recipes/suggest", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = (request.body ?? {}) as { weekStart?: string; mealType?: "breakfast" | "lunch" | "dinner"; maxMinutes?: number };
    try {
      await reply.send(
        await dependencies.householdService.suggestRecipes(authenticated.user.id, {
          weekStart: String(body.weekStart ?? ""),
          ...(body.mealType ? { mealType: body.mealType } : {}),
          ...(body.maxMinutes ? { maxMinutes: body.maxMinutes } : {}),
        }),
      );
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/recipes/ai", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = (request.body ?? {}) as { weekStart?: string; note?: string };
    try {
      await reply.send(
        await dependencies.householdService.askAi(authenticated.user.id, {
          weekStart: String(body.weekStart ?? ""),
          ...(body.note ? { note: body.note } : {}),
        }),
      );
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/recipes/catalog", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = (request.body ?? {}) as { mealType?: "breakfast" | "lunch" | "dinner" };
    await reply.send(await dependencies.householdService.catalog(body.mealType));
  });

  app.post("/prefs/get", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    try {
      await reply.send(await dependencies.householdService.getPrefs(authenticated.user.id));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/prefs/save", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    const body = request.body as { breakfast: string; lunch: string; dinner: string };
    try {
      await reply.send(await dependencies.householdService.savePrefs(authenticated.user.id, body));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });

  app.post("/assistant/run", async (request, reply) => {
    const authenticated = await withUser(request, reply);
    if (!authenticated) return;
    if (!dependencies.agendaService) {
      await sendRequestFailure(request, reply, 502);
      return;
    }
    const body = (request.body ?? {}) as { command?: string };
    try {
      const assistant = new AssistantService(dependencies.householdService, dependencies.agendaService);
      await reply.send(await assistant.run(authenticated.user.id, String(body.command ?? "")));
    } catch (error) {
      await sendRequestFailure(request, reply, statusOf(error));
    }
  });
};

export default internalHouseholdRoutes;
