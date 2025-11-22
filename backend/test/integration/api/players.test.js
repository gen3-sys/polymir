/**
 * PLAYER API INTEGRATION TESTS
 * =============================
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import request from 'supertest';
import { createPlayerRoutes } from '../../../src/api/routes/players.js';
import { MockIPFSClient } from '../../setup.js';

describe('Player API Integration', () => {
    let app;
    let mockDB;
    let ipfsClient;

    before(() => {
        mockDB = {
            players: new Map(),
            trustHistory: new Map(),

            async createPlayer(username, passwordHash) {
                const playerId = `player-${Date.now()}-${Math.random()}`;
                const player = {
                    player_id: playerId,
                    username,
                    password_hash: passwordHash,
                    trust_score: 0.5,
                    validations_submitted: 0,
                    validations_correct: 0,
                    validations_incorrect: 0,
                    created_at: new Date(),
                    last_active: new Date()
                };
                this.players.set(playerId, player);
                return player;
            },

            async getPlayerByUsername(username) {
                for (const player of this.players.values()) {
                    if (player.username === username) {
                        return player;
                    }
                }
                return null;
            },

            async getPlayerById(playerId) {
                return this.players.get(playerId) || null;
            },

            async updateLastActive(playerId) {
                const player = this.players.get(playerId);
                if (player) {
                    player.last_active = new Date();
                }
            },

            async getTopPlayersByTrust(limit) {
                const players = Array.from(this.players.values());
                return players
                    .sort((a, b) => b.trust_score - a.trust_score)
                    .slice(0, limit);
            }
        };

        ipfsClient = new MockIPFSClient();

        app = express();
        app.use(express.json());
        app.use('/players', createPlayerRoutes(mockDB, ipfsClient));
    });

    describe('POST /players/register', () => {
        it('should register a new player', async () => {
            const response = await request(app)
                .post('/players/register')
                .send({
                    username: 'testplayer1',
                    password: 'password123'
                });

            assert.strictEqual(response.status, 201);
            assert.ok(response.body.player);
            assert.strictEqual(response.body.player.username, 'testplayer1');
            assert.strictEqual(response.body.player.trust_score, 0.5);
        });

        it('should reject duplicate usernames', async () => {
            await request(app)
                .post('/players/register')
                .send({
                    username: 'duplicate',
                    password: 'password123'
                });

            const response = await request(app)
                .post('/players/register')
                .send({
                    username: 'duplicate',
                    password: 'password456'
                });

            assert.strictEqual(response.status, 400);
            assert.ok(response.body.error);
        });

        it('should reject invalid usernames', async () => {
            const response = await request(app)
                .post('/players/register')
                .send({
                    username: 'ab', // Too short
                    password: 'password123'
                });

            assert.strictEqual(response.status, 400);
        });

        it('should reject weak passwords', async () => {
            const response = await request(app)
                .post('/players/register')
                .send({
                    username: 'testplayer2',
                    password: '123' // Too short
                });

            assert.strictEqual(response.status, 400);
        });

        it('should hash passwords', async () => {
            const response = await request(app)
                .post('/players/register')
                .send({
                    username: 'testplayer3',
                    password: 'password123'
                });

            const player = await mockDB.getPlayerByUsername('testplayer3');
            assert.notStrictEqual(player.password_hash, 'password123');
            assert.ok(player.password_hash.startsWith('$2b$')); // bcrypt hash
        });
    });

    describe('POST /players/login', () => {
        before(async () => {
            await request(app)
                .post('/players/register')
                .send({
                    username: 'logintest',
                    password: 'password123'
                });
        });

        it('should login with correct credentials', async () => {
            const response = await request(app)
                .post('/players/login')
                .send({
                    username: 'logintest',
                    password: 'password123'
                });

            assert.strictEqual(response.status, 200);
            assert.ok(response.body.player);
            assert.strictEqual(response.body.player.username, 'logintest');
        });

        it('should reject incorrect password', async () => {
            const response = await request(app)
                .post('/players/login')
                .send({
                    username: 'logintest',
                    password: 'wrongpassword'
                });

            assert.strictEqual(response.status, 401);
        });

        it('should reject nonexistent username', async () => {
            const response = await request(app)
                .post('/players/login')
                .send({
                    username: 'nonexistent',
                    password: 'password123'
                });

            assert.strictEqual(response.status, 401);
        });

        it('should update last_active timestamp', async () => {
            const playerBefore = await mockDB.getPlayerByUsername('logintest');
            const timeBefore = playerBefore.last_active.getTime();

            await new Promise(resolve => setTimeout(resolve, 10));

            await request(app)
                .post('/players/login')
                .send({
                    username: 'logintest',
                    password: 'password123'
                });

            const playerAfter = await mockDB.getPlayerByUsername('logintest');
            const timeAfter = playerAfter.last_active.getTime();

            assert.ok(timeAfter > timeBefore);
        });
    });

    describe('GET /players/:playerId', () => {
        let testPlayerId;

        before(async () => {
            const response = await request(app)
                .post('/players/register')
                .send({
                    username: 'gettest',
                    password: 'password123'
                });

            testPlayerId = response.body.player.player_id;
        });

        it('should get player by ID', async () => {
            const response = await request(app)
                .get(`/players/${testPlayerId}`);

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.player.username, 'gettest');
        });

        it('should return 404 for nonexistent player', async () => {
            const response = await request(app)
                .get('/players/nonexistent-id');

            assert.strictEqual(response.status, 404);
        });

        it('should not include password hash in response', async () => {
            const response = await request(app)
                .get(`/players/${testPlayerId}`);

            assert.strictEqual(response.body.player.password_hash, undefined);
        });
    });

    describe('GET /players/leaderboard', () => {
        before(async () => {
            // Create players with different trust scores
            const player1 = await mockDB.createPlayer('leader1', 'hash1');
            const player2 = await mockDB.createPlayer('leader2', 'hash2');
            const player3 = await mockDB.createPlayer('leader3', 'hash3');

            player1.trust_score = 0.9;
            player2.trust_score = 0.7;
            player3.trust_score = 0.5;
        });

        it('should return leaderboard sorted by trust', async () => {
            const response = await request(app)
                .get('/players/leaderboard?limit=10');

            assert.strictEqual(response.status, 200);
            assert.ok(Array.isArray(response.body.leaderboard));

            const scores = response.body.leaderboard.map(p => p.trust_score);
            const sortedScores = [...scores].sort((a, b) => b - a);

            assert.deepStrictEqual(scores, sortedScores);
        });

        it('should limit results', async () => {
            const response = await request(app)
                .get('/players/leaderboard?limit=2');

            assert.ok(response.body.leaderboard.length <= 2);
        });
    });
});
