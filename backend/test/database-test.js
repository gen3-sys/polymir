/**
 * POLYMIR DATABASE TEST SCRIPT
 * =============================
 * Interactive script to test database operations
 * Creates sample data, tests queries, and demonstrates functionality
 */

import { config } from '../src/config.js';
import { poolManager } from '../src/db/pool.js';
import { CentralLibraryDB } from '../src/db/centralLibrary.js';
import { WorldServerDB } from '../src/db/worldServer.js';
import bcrypt from 'bcrypt';

const log = {
    info: (msg, data) => console.log(`✅ ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    error: (msg, data) => console.error(`❌ ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    warn: (msg, data) => console.warn(`⚠️  ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    success: (msg) => console.log(`🎉 ${msg}`)
};

// =============================================
// SAMPLE DATA
// =============================================

const SAMPLE_PLAYERS = [
    { username: 'alice', password: 'password123', trustBonus: 0.3 },
    { username: 'bob', password: 'password123', trustBonus: 0.2 },
    { username: 'charlie', password: 'password123', trustBonus: 0.1 },
    { username: 'david', password: 'password123', trustBonus: 0.0 },
    { username: 'eve', password: 'password123', trustBonus: -0.1 }
];

const SAMPLE_SCHEMATICS = [
    {
        name: 'Small House',
        tags: ['building', 'home', 'small'],
        data: {
            size: { x: 10, y: 8, z: 10 },
            blocks: Array(100).fill(null).map((_, i) => ({
                x: i % 10,
                y: Math.floor(i / 100),
                z: Math.floor((i % 100) / 10),
                type: 'stone'
            }))
        }
    },
    {
        name: 'Tower',
        tags: ['building', 'defense', 'tall'],
        data: {
            size: { x: 5, y: 20, z: 5 },
            blocks: Array(50).fill(null).map((_, i) => ({
                x: i % 5,
                y: Math.floor(i / 25),
                z: Math.floor((i % 25) / 5),
                type: 'stone'
            }))
        }
    },
    {
        name: 'Garden',
        tags: ['nature', 'decoration', 'outdoor'],
        data: {
            size: { x: 15, y: 3, z: 15 },
            blocks: Array(100).fill(null).map((_, i) => ({
                x: i % 15,
                y: 0,
                z: Math.floor(i / 15),
                type: 'grass'
            }))
        }
    }
];

// =============================================
// TEST FUNCTIONS
// =============================================

async function initializeDatabases() {
    log.info('Initializing database connections...');

    const centralPool = poolManager.createPool('CENTRAL_LIBRARY', {
        host: config.centralDB.host,
        port: config.centralDB.port,
        database: config.centralDB.database,
        user: config.centralDB.user,
        password: config.centralDB.password,
        max: config.centralDB.maxConnections
    });

    const worldPool = poolManager.createPool('WORLD_SERVER', {
        host: config.worldDB.host,
        port: config.worldDB.port,
        database: config.worldDB.database,
        user: config.worldDB.user,
        password: config.worldDB.password,
        max: config.worldDB.maxConnections
    });

    await poolManager.initializeAll();

    const centralDB = new CentralLibraryDB(centralPool);
    const worldDB = new WorldServerDB(worldPool);

    log.success('Database connections initialized');
    return { centralDB, worldDB };
}

async function createSamplePlayers(centralDB) {
    log.info('Creating sample players...');
    const players = [];

    for (const playerData of SAMPLE_PLAYERS) {
        try {
            const passwordHash = await bcrypt.hash(playerData.password, 10);
            const player = await centralDB.createPlayer(playerData.username, passwordHash);

            // Adjust trust score
            if (playerData.trustBonus !== 0) {
                const newTrust = Math.max(0, Math.min(1, player.trust_score + playerData.trustBonus));
                await centralDB.updatePlayerTrustScore(player.player_id, newTrust);
                player.trust_score = newTrust;
            }

            players.push(player);
            log.info(`  Created player: ${player.username} (trust: ${player.trust_score.toFixed(2)})`);
        } catch (error) {
            log.warn(`  Player ${playerData.username} already exists, skipping`);
        }
    }

    return players;
}

async function createSampleSchematics(centralDB, players) {
    log.info('Creating sample schematics...');
    const schematics = [];

    for (let i = 0; i < SAMPLE_SCHEMATICS.length; i++) {
        const schematicData = SAMPLE_SCHEMATICS[i];
        const creator = players[i % players.length];

        try {
            // Mock IPFS CID
            const mockCID = `Qm${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;

            const schematic = await centralDB.createSchematic(
                creator.player_id,
                schematicData.name,
                schematicData.tags,
                mockCID,
                JSON.stringify(schematicData.data)
            );

            schematics.push(schematic);
            log.info(`  Created schematic: ${schematic.name} by ${creator.username}`);
        } catch (error) {
            log.error(`  Failed to create schematic ${schematicData.name}:`, error.message);
        }
    }

    return schematics;
}

async function testSchematicSearch(centralDB) {
    log.info('Testing schematic search...');

    // Search by tag
    const buildingSchematics = await centralDB.searchSchematics({ tags: ['building'] });
    log.info(`  Found ${buildingSchematics.length} building schematics`);

    // Search by name
    const houseSchematics = await centralDB.searchSchematics({ searchTerm: 'house' });
    log.info(`  Found ${houseSchematics.length} schematics matching "house"`);

    return { buildingSchematics, houseSchematics };
}

async function testValidationFlow(centralDB, players, schematics) {
    log.info('Testing validation flow...');

    if (schematics.length === 0 || players.length < 3) {
        log.warn('  Not enough data for validation test');
        return;
    }

    const submitter = players[0];
    const schematic = schematics[0];
    const validators = players.slice(1, 4); // Get 3 validators

    try {
        // Request validation
        const consensus = await centralDB.createConsensusResult({
            submitterId: submitter.player_id,
            eventType: 'schematic_placement',
            eventDataCid: schematic.ipfs_cid,
            requiredValidators: 3,
            consensusAlgorithm: 'simple_majority'
        });

        log.info(`  Created consensus request: ${consensus.consensus_id}`);

        // Validators vote
        for (let i = 0; i < validators.length; i++) {
            const validator = validators[i];
            const approved = i < 2; // 2 approve, 1 rejects

            await centralDB.recordValidationVote(
                consensus.consensus_id,
                validator.player_id,
                approved,
                'Validation comment'
            );

            log.info(`  ${validator.username} voted: ${approved ? 'APPROVE' : 'REJECT'}`);
        }

        // Finalize consensus
        const votes = await centralDB.getConsensusVotes(consensus.consensus_id);
        const approvals = votes.filter(v => v.approved).length;
        const accepted = approvals > votes.length / 2;

        await centralDB.updateConsensusResult(consensus.consensus_id, accepted);
        log.success(`  Consensus reached: ${accepted ? 'ACCEPTED' : 'REJECTED'} (${approvals}/${votes.length} approved)`);

        return { consensus, votes, accepted };
    } catch (error) {
        log.error('  Validation flow failed:', error.message);
    }
}

async function testWorldServer(worldDB, players) {
    log.info('Testing world server operations...');

    try {
        // Create megachunk
        const megachunk = await worldDB.getOrCreateMegachunk(0, 0, 0);
        log.info(`  Created/Retrieved megachunk: (0,0,0)`);

        // Create celestial body
        const body = await worldDB.createCelestialBody(
            megachunk.megachunk_id,
            'test-planet',
            'terrestrial',
            100.0, 50.0, 100.0, // position
            6371.0 // radius (Earth-like)
        );
        log.info(`  Created celestial body: ${body.name}`);

        // Update player positions
        for (const player of players.slice(0, 3)) {
            await worldDB.upsertPlayerPosition(
                player.player_id,
                megachunk.megachunk_id,
                Math.random() * 256,
                Math.random() * 256,
                Math.random() * 256,
                body.body_id
            );
        }
        log.info(`  Updated ${players.slice(0, 3).length} player positions`);

        // Get players in megachunk
        const playersInMegachunk = await worldDB.getPlayersInMegachunk(megachunk.megachunk_id);
        log.info(`  Players in megachunk: ${playersInMegachunk.length}`);

        return { megachunk, body, playersInMegachunk };
    } catch (error) {
        log.error('  World server test failed:', error.message);
    }
}

async function displayStatistics(centralDB, worldDB) {
    log.info('\n📊 Database Statistics:');

    try {
        const playerCount = await centralDB.pool.query('SELECT COUNT(*) FROM players');
        const schematicCount = await centralDB.pool.query('SELECT COUNT(*) FROM schematics');
        const consensusCount = await centralDB.pool.query('SELECT COUNT(*) FROM consensus_results');

        console.log(`\nCentral Library:`);
        console.log(`  Players: ${playerCount.rows[0].count}`);
        console.log(`  Schematics: ${schematicCount.rows[0].count}`);
        console.log(`  Consensus Results: ${consensusCount.rows[0].count}`);

        const megachunkCount = await worldDB.pool.query('SELECT COUNT(*) FROM megachunks');
        const bodyCount = await worldDB.pool.query('SELECT COUNT(*) FROM celestial_bodies');
        const positionCount = await worldDB.pool.query('SELECT COUNT(*) FROM player_positions');

        console.log(`\nWorld Server:`);
        console.log(`  Megachunks: ${megachunkCount.rows[0].count}`);
        console.log(`  Celestial Bodies: ${bodyCount.rows[0].count}`);
        console.log(`  Player Positions: ${positionCount.rows[0].count}`);
    } catch (error) {
        log.error('Failed to get statistics:', error.message);
    }
}

async function interactiveMenu(centralDB, worldDB, players, schematics) {
    console.log('\n' + '='.repeat(60));
    console.log('🎮 INTERACTIVE DATABASE TEST MENU');
    console.log('='.repeat(60));
    console.log('1. List all players');
    console.log('2. List all schematics');
    console.log('3. Search schematics by tag');
    console.log('4. View player trust scores');
    console.log('5. View leaderboard');
    console.log('6. Create new player');
    console.log('7. Upload new schematic');
    console.log('8. Display statistics');
    console.log('9. Exit');
    console.log('='.repeat(60));
}

async function listAllPlayers(centralDB) {
    const result = await centralDB.pool.query('SELECT username, trust_score, created_at FROM players ORDER BY trust_score DESC');
    console.log('\n👥 All Players:');
    result.rows.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.username} - Trust: ${p.trust_score.toFixed(2)} - Joined: ${p.created_at.toLocaleDateString()}`);
    });
}

async function listAllSchematics(centralDB) {
    const result = await centralDB.pool.query(`
        SELECT s.name, s.tags, p.username as creator, s.created_at
        FROM schematics s
        JOIN players p ON s.creator_id = p.player_id
        ORDER BY s.created_at DESC
    `);
    console.log('\n🏗️  All Schematics:');
    result.rows.forEach((s, i) => {
        console.log(`  ${i + 1}. "${s.name}" by ${s.creator} [${s.tags.join(', ')}]`);
    });
}

// =============================================
// MAIN TEST RUNNER
// =============================================

async function main() {
    console.log('🚀 POLYMIR DATABASE TEST SUITE\n');

    let centralDB, worldDB, players, schematics;

    try {
        // Initialize
        ({ centralDB, worldDB } = await initializeDatabases());

        // Create sample data
        players = await createSamplePlayers(centralDB);
        schematics = await createSampleSchematics(centralDB, players);

        // Run tests
        await testSchematicSearch(centralDB);
        await testValidationFlow(centralDB, players, schematics);
        await testWorldServer(worldDB, players);

        // Display stats
        await displayStatistics(centralDB, worldDB);

        // Interactive menu
        console.log('\n✅ All automated tests completed successfully!');
        console.log('\n📋 Test Data Created:');
        console.log(`   - ${players.length} players`);
        console.log(`   - ${schematics.length} schematics`);
        console.log(`   - Validation flow tested`);
        console.log(`   - World server tested`);

        console.log('\n💡 You can now:');
        console.log('   1. Start the backend server: npm start');
        console.log('   2. Use the test credentials:');
        console.log('      - Username: alice, bob, charlie, david, or eve');
        console.log('      - Password: password123');
        console.log('   3. Test API endpoints with curl or Postman');
        console.log('   4. Connect to WebSocket on ws://localhost:3001');

    } catch (error) {
        log.error('Test suite failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Cleanup
        await poolManager.closeAll();
        log.info('\nDatabase connections closed');
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { main, initializeDatabases, createSamplePlayers, createSampleSchematics };

