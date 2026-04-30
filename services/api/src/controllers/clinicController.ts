import type { Request, Response } from "express";
import type { QueryResult } from "pg";
import { dbPool } from "../config/database";
import { ApiError } from "../middleware/errorHandler";

type ClinicRow = {
  id: number;
  name: string;
  slug: string | null;
  logo_url: string | null;
  primary_color: string | null;
};

const CLINIC_FALLBACK = {
  id: 1,
  name: "Kamilovs Clinic",
  slug: "kamilovs-clinic",
  logoUrl: "/logo.png",
  primaryColor: "#6D28D9",
};

type CreateClinicBody = {
  name?: string;
  slug?: string;
};

export const clinicMeController = async (req: Request, res: Response) => {
  const fromRequest = req.clinicId ?? req.auth?.clinicId;
  const clinicId = Number.isInteger(fromRequest) && (fromRequest as number) > 0 ? (fromRequest as number) : 1;

  try {
    const result: QueryResult<ClinicRow> = await dbPool.query(
      `
        SELECT id, name, slug, logo_url, primary_color
        FROM clinics
        WHERE id = $1
        LIMIT 1;
      `,
      [clinicId]
    );

    const row = result.rows[0];
    if (!row) {
      return res.status(200).json(CLINIC_FALLBACK);
    }

    return res.status(200).json({
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logo_url ?? CLINIC_FALLBACK.logoUrl,
      primaryColor: row.primary_color ?? CLINIC_FALLBACK.primaryColor,
    });
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === "42P01") {
      return res.status(200).json(CLINIC_FALLBACK);
    }
    throw error;
  }
};

export const createClinicController = async (req: Request<unknown, unknown, CreateClinicBody>, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const slug = typeof req.body?.slug === "string" ? req.body.slug.trim().toLowerCase() : "";

  if (!name) {
    throw new ApiError(400, "name is required");
  }
  if (!slug) {
    throw new ApiError(400, "slug is required");
  }

  const existing = await dbPool.query<{ id: number }>(
    `
      SELECT id
      FROM clinics
      WHERE lower(slug) = lower($1)
      LIMIT 1;
    `,
    [slug]
  );

  if (existing.rowCount && existing.rows[0]) {
    throw new ApiError(409, "slug already exists");
  }

  const result: QueryResult<ClinicRow> = await dbPool.query(
    `
      INSERT INTO clinics (name, slug, logo_url, primary_color)
      VALUES ($1, $2, '/logo.png', '#6D28D9')
      RETURNING id, name, slug, logo_url, primary_color;
    `,
    [name, slug]
  );

  const row = result.rows[0];
  if (!row) {
    throw new ApiError(500, "failed to create clinic");
  }

  return res.status(201).json({
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url ?? CLINIC_FALLBACK.logoUrl,
    primaryColor: row.primary_color ?? CLINIC_FALLBACK.primaryColor,
  });
};
