/** ******************************************************************************
 *  (c) 2020 Zondax GmbH
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ******************************************************************************* */

import jest, {expect} from "jest";
import Zemu from "@zondax/zemu";
import FilecoinApp from "@zondax/ledger-filecoin";
import {getDigest} from "./utils";
import * as secp256k1 from "secp256k1";

const Resolve = require("path").resolve;
const APP_PATH = Resolve("../app/bin/app.elf");

const APP_SEED = "equip will roof matter pink blind book anxiety banner elbow sun young"
const sim_options = {
    logging: true,
    start_delay: 3000,
    custom: `-s "${APP_SEED}"`
    , X11: true
};

jest.setTimeout(25000)

describe('Basic checks', function () {
    it('can start and stop container', async function () {
        const sim = new Zemu(APP_PATH);
        try {
            await sim.start(sim_options);
        } finally {
            await sim.close();
        }
    });

    it('app version', async function () {
        const sim = new Zemu(APP_PATH);
        try {
            await sim.start(sim_options);
            const app = new FilecoinApp(sim.getTransport());
            const resp = await app.getVersion();

            console.log(resp);

            expect(resp.return_code).toEqual(0x9000);
            expect(resp.error_message).toEqual("No errors");
            expect(resp).toHaveProperty("test_mode");
            expect(resp).toHaveProperty("major");
            expect(resp).toHaveProperty("minor");
            expect(resp).toHaveProperty("patch");
        } finally {
            await sim.close();
        }
    });

    it('device info', async function () {
        const sim = new Zemu(APP_PATH);
        try {
            await sim.start(sim_options);
            const app = new FilecoinApp(sim.getTransport());
            const resp = await app.deviceInfo();

            console.log(resp);

            expect(resp.return_code).toEqual(0x9000);
            expect(resp.error_message).toEqual("No errors");
            expect(resp).toHaveProperty("targetId");
            expect(resp).toHaveProperty("seVersion");
            expect(resp).toHaveProperty("flag");
            expect(resp).toHaveProperty("mcuVersion");
        } finally {
            await sim.close();
        }
    });

    it('get address', async function () {
        const sim = new Zemu(APP_PATH);
        try {
            await sim.start(sim_options);
            const app = new FilecoinApp(sim.getTransport());

            const path = "m/44'/461'/5'/0/3";
            const resp = await app.getAddressAndPubKey(path);

            console.log(resp)

            expect(resp.return_code).toEqual(0x9000);
            expect(resp.error_message).toEqual("No errors");

            const expected_address_string = "f1mk3zcefvlgpay4f32c5vmruk5gqig6dumc7pz6q";
            const expected_pk = "0425d0dbeedb2053e690a58e9456363158836b1361f30dba0332f440558fa803d056042b50d0e70e4a2940428e82c7cea54259d65254aed4663e4d0cffd649f4fb";

            expect(resp.addrString).toEqual(expected_address_string);
            expect(resp.compressed_pk.toString('hex')).toEqual(expected_pk);

        } finally {
            await sim.close();
        }
    });

    it('show address', async function () {
        const snapshotPrefixGolden = "snapshots/show-address/";
        const snapshotPrefixTmp = "snapshots-tmp/show-address/";
        let snapshotCount = 0;

        const sim = new Zemu(APP_PATH);
        try {
            await sim.start(sim_options);
            const app = new FilecoinApp(sim.getTransport());

            // Derivation path. First 3 items are automatically hardened!
            const path = "m/44'/461'/5'/0/3";
            const respRequest = app.showAddressAndPubKey(path);
            // Wait until we are not in the main menu
            await sim.waitUntilScreenIsNot(sim.getMainMenuSnapshot());

            // Now navigate the address / path
            await sim.compareSnapshotsAndAccept(".", "show_address", 3);

            const resp = await respRequest;
            console.log(resp);

            expect(resp.return_code).toEqual(0x9000);
            expect(resp.error_message).toEqual("No errors");

            const expected_address_string = "f1mk3zcefvlgpay4f32c5vmruk5gqig6dumc7pz6q";
            const expected_pk = "0425d0dbeedb2053e690a58e9456363158836b1361f30dba0332f440558fa803d056042b50d0e70e4a2940428e82c7cea54259d65254aed4663e4d0cffd649f4fb";

            expect(resp.addrString).toEqual(expected_address_string);
            expect(resp.compressed_pk.toString('hex')).toEqual(expected_pk);
        } finally {
            await sim.close();
        }
    });

    it('sign basic & verify', async function () {
        const sim = new Zemu(APP_PATH);
        try {
            await sim.start(sim_options);
            const app = new FilecoinApp(sim.getTransport());

            const path = "m/44'/461'/0'/0/1";
            const txBlob = Buffer.from(
                "8a0058310396a1a3e4ea7a14d49985e661b22401d44fed402d1d0925b243c923589c0fbc7e32cd04e29ed78d15d37d3aaa3fe6da3358310386b454258c589475f7d16f5aac018a79f6c1169d20fc33921dd8b5ce1cac6c348f90a3603624f6aeb91b64518c2e80950144000186a01961a8430009c44200000040",
                "hex",
            );

            const pkResponse = await app.getAddressAndPubKey(path);
            console.log(pkResponse);
            expect(pkResponse.return_code).toEqual(0x9000);
            expect(pkResponse.error_message).toEqual("No errors");

            // do not wait here..
            const signatureRequest = app.sign(path, txBlob);
            // Wait until we are not in the main menu
            await sim.waitUntilScreenIsNot(sim.getMainMenuSnapshot());

            await sim.compareSnapshotsAndAccept(".", "sign_basic", 13);

            let resp = await signatureRequest;
            console.log(resp);

            expect(resp.return_code).toEqual(0x9000);
            expect(resp.error_message).toEqual("No errors");

            // Verify signature
            const pk = Uint8Array.from(pkResponse.compressed_pk)
            const digest = getDigest( txBlob );
            const signature = secp256k1.signatureImport(Uint8Array.from(resp.signature_der));
            const signatureOk = secp256k1.ecdsaVerify(signature, digest, pk);
            expect(signatureOk).toEqual(true);
        } finally {
            await sim.close();
        }
    });

    it('sign basic - invalid', async function () {
        const sim = new Zemu(APP_PATH);
        try {
            await sim.start(sim_options);
            const app = new FilecoinApp(sim.getTransport());

            const path = "m/44'/461'/0'/0/1";
            let invalidMessage = Buffer.from(
                "890055026d21137eb4c4814269e894d296cf6500e43cd7145502e0c7c75f82d55e5ed55db28033630df4274a984f0144000186a0430009c41961a80040",
                "hex",
            );
            invalidMessage += "1";

            const pkResponse = await app.getAddressAndPubKey(path);
            console.log(pkResponse);
            expect(pkResponse.return_code).toEqual(0x9000);
            expect(pkResponse.error_message).toEqual("No errors");

            // do not wait here..
            const signatureResponse = await app.sign(path, invalidMessage);
            console.log(signatureResponse);

            expect(signatureResponse.return_code).toEqual(0x6984);
            expect(signatureResponse.error_message).toEqual("Data is invalid : Unexpected data type");
        } finally {
            await sim.close();
        }
    });

    it('sign proposal', async function () {
        const snapshotPrefixGolden = "snapshots/sign-proposal/";
        const snapshotPrefixTmp = "snapshots-tmp/sign-proposal/";
        let snapshotCount = 0;

        const sim = new Zemu(APP_PATH);
        try {
            await sim.start(sim_options);
            const app = new FilecoinApp(sim.getTransport());

            // Put the app in expert mode
            await sim.clickRight();
            await sim.clickBoth();
            await sim.clickLeft();

            const path = "m/44'/461'/0'/0/1";
            const txBlob = Buffer.from(
                "8a004300ec075501dfe49184d46adc8f89d44638beb45f78fcad259001401a000f4240430009c4430009c402581d845501dfe49184d46adc8f89d44638beb45f78fcad2590430003e80040",
                "hex",
            );

            const pkResponse = await app.getAddressAndPubKey(path);
            console.log(pkResponse);
            expect(pkResponse.return_code).toEqual(0x9000);
            expect(pkResponse.error_message).toEqual("No errors");

            // do not wait here so we can get snapshots and interact with the app
            const signatureRequest = app.sign(path, txBlob);

            // Wait until we are not in the main menu
            await sim.waitUntilScreenIsNot(sim.getMainMenuSnapshot());

            await sim.compareSnapshotsAndAccept(".", "sign_proposal", 15);

            let resp = await signatureRequest;
            console.log(resp);

            expect(resp.return_code).toEqual(0x9000);
            expect(resp.error_message).toEqual("No errors");
        } finally {
            await sim.close();
        }
    });
});
