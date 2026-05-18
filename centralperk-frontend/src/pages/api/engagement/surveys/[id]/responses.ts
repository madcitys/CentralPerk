import type { NextApiRequest, NextApiResponse } from "next";

import { deleteSurveyResponse, submitSurveyResponse } from "../../../../../server/engagement-data";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed." } });
  }

  const surveyId = String(req.query.id || "").trim();
  if (!surveyId) {
    return res.status(400).json({ ok: false, error: { message: "Missing survey id." } });
  }

  try {
    if (req.method === "DELETE") {
      await deleteSurveyResponse({
        surveyId,
        memberIdentifier: String(req.body?.memberIdentifier || "").trim(),
      });
      return res.status(200).json({ ok: true });
    }

    const response = await submitSurveyResponse({
      surveyId,
      memberIdentifier: String(req.body?.memberIdentifier || "").trim(),
      answers: req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {},
    });
    return res.status(200).json({ ok: true, response });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update survey response.";
    return res.status(500).json({ ok: false, error: { message } });
  }
}
