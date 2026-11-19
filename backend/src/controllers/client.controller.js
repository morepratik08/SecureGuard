import { createAccount } from '../services/account.service.js';
import { getClient, getClientForUser, getMyClient, listClients, updateClient, updateClientStatus } from '../services/client.service.js';
import { validateClientCreation, validateClientListQuery, validateClientUpdate, validateStatus } from '../validators/client.validator.js';
import { parseAccountId } from '../validators/account.validator.js';
import { HttpError } from '../utils/http-error.js';

export async function listClientsController(req, res) {
  const result = await listClients(req.user, validateClientListQuery(req.query));
  res.json({ success: true, ...result });
}
export async function createClientController(req, res) {
  const input = validateClientCreation(req.body, req.user.role);
  const user = await createAccount(input, { auditActorId: req.user.id });
  const client = await getClientForUser(req.user, user.id);
  res.status(201).json({ success: true, client });
}
export async function getClientController(req, res) {
  const clientId = parseAccountId(req.params.clientId);
  if (!clientId) throw new HttpError(400, 'A valid client ID is required.');
  res.json({ success: true, client: await getClient(req.user, clientId.toString()) });
}
export async function getMyClientController(req, res) {
  res.json({ success: true, client: await getMyClient(req.user) });
}
export async function updateClientController(req, res) {
  const clientId = parseAccountId(req.params.clientId);
  if (!clientId) throw new HttpError(400, 'A valid client ID is required.');
  const client = await updateClient({ actor: req.user, clientId: clientId.toString(), input: validateClientUpdate(req.body) });
  res.json({ success: true, client });
}
export async function updateMyClientController(req, res) {
  const client = await updateClient({ actor: req.user, clientId: (await getMyClient(req.user)).id, input: validateClientUpdate(req.body) });
  res.json({ success: true, client });
}
export async function updateClientStatusController(req, res) {
  const clientId = parseAccountId(req.params.clientId);
  if (!clientId) throw new HttpError(400, 'A valid client ID is required.');
  const status = validateStatus(req.body?.status);
  await updateClientStatus({ actorId: req.user.id, clientId: clientId.toString(), status });
  res.json({ success: true, message: 'Client status updated.' });
}
