/*
 * Copyright (c) 2021 Robert Sahlin
 *
 * Use of this software is governed by the Business Source License 1.1.
 * 
 * Parameters
 * 
 * Licensor:             Robert Sahlin
 * Licensed Work:        streamprocessor
 *                       The Licensed Work is (c) 2021 Robert Sahlin.
 * Additional Use Grant: You may use the Licensed Work when the Licensed Work is 
 *                       processing less than 3 Million events per month and legal entity,
 *                       provided that you do not use the Licensed Work for a 
 *                       commercial offering that allows third parties to access
 *                       the functionality of the Licensed Work so that such third
 *                       parties directly benefit from the features of the Licensed Work.
 *                       
 * Change Date:          24 months after code release (major or minor semantic version upgrade)
 * 
 * Change License:       GNU AFFERO GENERAL PUBLIC LICENSE, Version 3
 * 
 * For information about alternative licensing arrangements for the Licensed Work,
 * please contact the licensor.
 */

import * as pulumi from "@pulumi/pulumi";
import * as crypto from "crypto";
import {BigQuery} from "@google-cloud/bigquery";
import * as fs from 'fs';
import {GoogleAuth} from 'google-auth-library';

var deepEqual = require('deep-equal')

const bigquery = new BigQuery();



export interface SubjectSchema { 
    subject: string, 
    filename: string, 
    schemaType: string, 
    references?: {
        name: string, 
        subject: string, 
        version: string
    }[]
} 

// Helper function to send requests to gcp services
export async function getServiceResponse(url: any = null, targetAudience: any = null){
    const auth = new GoogleAuth();
    async function request() {
        if (!targetAudience) {
            // Use the request URL hostname as the target audience for requests.
            targetAudience = new URL(url).origin;
        }
        const client = await auth.getIdTokenClient(targetAudience);
        const res = await client.request({url});
        const schema: string = res.data as string;
        return JSON.stringify(JSON.parse(schema));
    }
  
    return request().catch(err => {
      console.error(err.message);
      throw err;
    });
}

// asynchronous function posting schemas from the schema folder to the schema registry
export async function postSchemasToRegistry(subjectSchema: SubjectSchema, hostname: string, targetAudience: any = null){
    if (!targetAudience) {
        // Use the request URL hostname as the target audience for requests.
        targetAudience = new URL(hostname).origin;
    }
    try{
        const auth = new GoogleAuth();
        console.log("posting schema for subject: " + subjectSchema.subject);
        const client = await auth.getIdTokenClient(targetAudience);
        
        let body = {
            "schema": JSON.parse(fs.readFileSync(__dirname + subjectSchema.filename, "utf8")),
            "schemaType": subjectSchema?.schemaType,
            "references": subjectSchema?.references
        };

        await client.request(
            {
                url: hostname + "/subjects/" + subjectSchema.subject + "/versions",
                method: 'POST',
                data: body
            }
        );
    }catch(err){
        console.error(err);
        process.exitCode = 1;
    }
}


// helper function to patch BigQuery tables
export async function patchTable(datasetId: string, tableId: string, hostname:string, subject: string){
    // get the subject's latest schema version from schema registry
    let newSchemaString: string  =  await getServiceResponse(`${hostname}/subjects/${subject}/versions/latest/bigqueryschema` , null);
    let table;

    try{
        //const table = bigquery.dataset(datasetId).table(tableId);
        table = bigquery.dataset(datasetId).table(tableId);
        const [metadata] = await table.getMetadata();
        const newSchemaObject = JSON.parse(newSchemaString);
        
        // check for differences between new and old schema and patch if different.
        if(!deepEqual(metadata.schema.fields, newSchemaObject)){
            console.info("Schemas are NOT identical, patching is required.");
            metadata.schema.fields = newSchemaObject;
            const [result] = await table.setMetadata(metadata);
            
            // return schema as it looks like in BigQuery
            return JSON.stringify(result.schema.fields);
        }else{
            console.info("Schemas are identical. No patching required.");
            return JSON.stringify(metadata.schema.fields);
        }
    }catch(err){
        console.error(err);
        if(err.code==404){
            console.info("Table doesn't exist yet, create a new one.");
            return newSchemaString;
        }else{
            process.exitCode = 1;
            return undefined;
        }
    }
}