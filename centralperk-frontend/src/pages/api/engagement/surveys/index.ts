import type { NextApiRequest, NextApiResponse } from "next";

import { createSurveyDefinition, fetchSurveyDefinitions } from "../../../../server/engagement-data";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  try {
    if (req.method === "POST") {
      const survey = await createSurveyDefinition(req.body ?? {});
      return res.status(200).json({ ok: true, survey });
    }

    const surveys = await fetchSurveyDefinitions();
    return res.status(200).json({ ok: true, surveys });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load surveys.";
    return res.status(500).json({ ok: false, error: { message } });
  }
}
