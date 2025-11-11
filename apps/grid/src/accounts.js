import { withGridClient } from './gridClient.js';
export async function createAccount(input) {
    return withGridClient((client) => client.createAccount(input));
}
export async function generateSessionSecrets() {
    return withGridClient((client) => client.generateSessionSecrets());
}
export async function completeAuthAndCreateAccount(input) {
    return withGridClient((client) => client.completeAuthAndCreateAccount(input));
}
export async function getAccountAddresses(accountId, params) {
    return withGridClient((client) => client.getAccountAddresses(accountId, params));
}
export async function getAccountBalances(accountId) {
    return withGridClient((client) => client.getAccountBalances(accountId));
}
export async function getTransfers(accountId, params) {
    return withGridClient((client) => client.getTransfers(accountId, params));
}
export async function createSpendingLimit(accountId, payload) {
    return withGridClient((client) => client.createSpendingLimit(accountId, payload));
}
