import { createSite, getSite, getSiteOptions, listSites, updateSite, updateSiteStatus } from '../services/site.service.js';
import { validateSiteInput, validateSiteListQuery, validateSiteStatus } from '../validators/site.validator.js';
import { parseAccountId } from '../validators/account.validator.js';
import { HttpError } from '../utils/http-error.js';

export async function listSitesController(req, res) {
  res.json({ success: true, ...(await listSites(req.user, validateSiteListQuery(req.query, req.user.role))) });
}
export async function siteOptionsController(req, res) {
  res.json({ success: true, options: await getSiteOptions() });
}
export async function createSiteController(req, res) {
  const site = await createSite({ actorId: req.user.id, input: validateSiteInput(req.body) });
  res.status(201).json({ success: true, site });
}
export async function getSiteController(req, res) {
  const siteId = parseAccountId(req.params.siteId);
  if (!siteId) throw new HttpError(400, 'A valid site ID is required.');
  res.json({ success: true, site: await getSite(req.user, siteId.toString()) });
}
export async function updateSiteController(req, res) {
  const siteId = parseAccountId(req.params.siteId);
  if (!siteId) throw new HttpError(400, 'A valid site ID is required.');
  const site = await updateSite({ actorId: req.user.id, siteId: siteId.toString(), input: validateSiteInput(req.body, { partial: true }) });
  res.json({ success: true, site });
}
export async function updateSiteStatusController(req, res) {
  const siteId = parseAccountId(req.params.siteId);
  if (!siteId) throw new HttpError(400, 'A valid site ID is required.');
  const status = validateSiteStatus(req.body?.status);
  const site = await updateSiteStatus({ actorId: req.user.id, siteId: siteId.toString(), status });
  res.json({ success: true, site });
}
