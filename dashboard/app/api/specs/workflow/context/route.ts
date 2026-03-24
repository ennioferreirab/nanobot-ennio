import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";

type AdminConvexClient = ConvexHttpClient & {
  query(name: string, args: Record<string, unknown>): Promise<unknown>;
  setAdminAuth(token: string): void;
};

function getClient(): AdminConvexClient {
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!) as AdminConvexClient;
  client.setAdminAuth(process.env.CONVEX_ADMIN_KEY!);
  return client;
}

export async function GET() {
  try {
    const convex = getClient();

    const [publishedSquads, reviewSpecs, connectedModelsRaw] = (await Promise.all([
      convex.query("squadSpecs:listByStatus", { status: "published" }),
      convex.query("reviewSpecs:listByStatus", { status: "published" }),
      convex.query("settings:get", { key: "connected_models" }),
    ])) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>, string | null];

    // For each squad, resolve agents and existing workflows in parallel
    const resolvedSquads = await Promise.all(
      publishedSquads.map(async (squad) => {
        const agentIds = Array.isArray(squad.agentIds) ? (squad.agentIds as string[]) : [];

        const [agentDocs, workflowDocs] = await Promise.all([
          agentIds.length > 0
            ? (convex.query("agents:listByIds", {
                ids: agentIds,
              }) as Promise<Array<Record<string, unknown>>>)
            : Promise.resolve([] as Array<Record<string, unknown>>),
          convex.query("workflowSpecs:listBySquad", {
            squadSpecId: squad._id as string,
          }) as Promise<Array<Record<string, unknown>>>,
        ]);

        const agents = agentDocs.map((agent) => ({
          id: agent._id,
          name: agent.name,
          displayName: agent.displayName,
          role: agent.role,
        }));

        const existingWorkflows = workflowDocs.map((wf) => ({
          id: wf._id,
          name: wf.name,
          stepCount: Array.isArray(wf.steps) ? (wf.steps as unknown[]).length : 0,
        }));

        return {
          id: squad._id,
          name: squad.name,
          displayName: squad.displayName,
          description: squad.description ?? null,
          agents,
          existingWorkflows,
        };
      }),
    );

    const availableReviewSpecs = reviewSpecs.map((spec) => ({
      id: spec._id,
      name: spec.name,
      scope: spec.scope,
      approvalThreshold: spec.approvalThreshold,
      reviewerPolicy: typeof spec.reviewerPolicy === "string" ? spec.reviewerPolicy : null,
      rejectionRoutingPolicy:
        typeof spec.rejectionRoutingPolicy === "string" ? spec.rejectionRoutingPolicy : null,
    }));

    let availableModels: string[] = [];
    if (connectedModelsRaw) {
      try {
        const parsed = JSON.parse(connectedModelsRaw);
        availableModels = Array.isArray(parsed)
          ? parsed.filter((value) => typeof value === "string")
          : [];
      } catch {
        availableModels = [];
      }
    }

    return NextResponse.json({
      publishedSquads: resolvedSquads,
      availableReviewSpecs,
      availableModels,
    });
  } catch (error) {
    console.error("Failed to build workflow authoring context:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load workflow authoring context",
      },
      { status: 500 },
    );
  }
}
