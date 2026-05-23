import { createProject, listProjects } from "@/app/lib/projects";

export async function GET() {
  const projects = await listProjects();
  return Response.json({ projects });
}

export async function POST(req: Request) {
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const meta = await createProject(body.name);
    return Response.json({ project: meta }, { status: 201 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
