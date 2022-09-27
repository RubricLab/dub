import { NextApiRequest, NextApiResponse } from "next";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { removeDomain } from "@/lib/domains";
import { deleteProject } from "@/lib/upstash";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getSession(req, res);
  if (!session?.user.id) return res.status(401).end("Unauthorized");

  const { slug } = req.query;
  if (!slug || typeof slug !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or misconfigured project slug" });
  }

  // GET /api/projects/[slug] – get a specific project with it's links
  if (req.method === "GET") {
    const project = await prisma.project.findFirst({
      where: {
        slug,
        users: {
          some: {
            userId: session.user.id,
          },
        },
      },
    });
    if (project) {
      return res.status(200).json(project);
    } else {
      return res.status(404).json({ error: "Project not found" });
    }

    // DELETE /api/projects/[slug] – edit a project
  } else if (req.method === "DELETE") {
    const domain = req.body;
    if (!domain || typeof domain !== "string") {
      return res.status(400).json({ error: "Missing or misconfigured domain" });
    }

    const [prismaResponse, domainResponse, upstashResponse] = await Promise.all(
      [
        prisma.project.delete({
          where: {
            slug,
          },
        }),
        removeDomain(domain),
        deleteProject(domain),
      ]
    );
    console.log(prismaResponse, domainResponse, upstashResponse);
    return res
      .status(200)
      .json({ prismaResponse, domainResponse, upstashResponse });
  } else {
    res.setHeader("Allow", ["GET", "DELETE"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}
