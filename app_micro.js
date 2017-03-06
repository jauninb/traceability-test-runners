var 
	async = require("async"),
	nconf = require("nconf"),
	request = require("request"),
	_ = require('underscore')
;

nconf.file("node_env", "config.json");

var username = nconf.get("username");
var password = nconf.get("password");
var organization_guid = nconf.get("organization_guid");
var loginUrl = nconf.get("loginUrl");
var otcApiUrl = nconf.get("otcApiUrl");

var githubRepos = [
		{
			"repoName" : "catalog-api-toolchain-demo-23fev",
			"repoUrl" : "https://github.com/jauninb/catalog-api-toolchain-demo-23fev.git",
			"revisionUrl" : "https://github.com/jauninb/catalog-api-toolchain-demo-23fev/commit/a01c48de2c8341824fa0eb5175de7e100a136ade",
			"enableTraceability": true,
			"enableIssue" : false
		},
		{
			"repoName" : "orders-api-toolchain-demo-23fev",
			"repoUrl" : "https://github.com/jauninb/orders-api-toolchain-demo-23fev.git",
			"revisionUrl" : "https://github.com/jauninb/orders-api-toolchain-demo-23fev/commit/614ee6c0e7c0eefcc438afc8e6fca25ef8b291ba",
			"enableTraceability": false,
			"enableIssue" : false
		},
		{
			"repoName" : "ui-toolchain-demo-23fev",
			"repoUrl" : "https://github.com/jauninb/ui-toolchain-demo-23fev.git",
			"revisionUrl" : "https://github.com/jauninb/ui-toolchain-demo-23fev/commit/4c20e22d50648d885a39597b9f6fa8b485a67fe7",
			"enableTraceability": true,
			"enableIssue" : true
		}
];

// github repo used for deployableMapping event
var usedRepoGithubIndex = 0;

var headers = {
	'Accept' : 'application/json'		
};

async.auto({
	// Retrieve authenticationToken
	authenticationToken: function(callback) {
    	getAuthenticationToken(username, password, callback);
	},
	// Retrieve new toolchain index
	toolchainIndex: ["authenticationToken", function(results, callback) {
    	headers['Authorization'] = results.authenticationToken;

    	request({
    		url : otcApiUrl + "/toolchains ",
    		headers : headers,
    		json: true
    	}, function(err, result, body) {
    		if (err) {
        		callback(err);
    		} else {
        		callback(null, body.total_results + 1);
    		}
    	});		
	}],
	// Create a new toolchain
	toolchainLocation: ["toolchainIndex", function(results, callback) {

    	var body = {
			"name" : "TraceabilityMicroToolchain" + results.toolchainIndex,
			"description" : "A toolchain micro based to test traceability",
			"public" : true,
			"organization_guid" : organization_guid,
			"key" : "traceabilityMicro" + results.toolchainIndex,
			"generator" : "API"
		};
    	
    	request({
    		url : otcApiUrl + "/toolchains",
    		headers : headers,
    		method: "POST",
    		body: body,
    		json: true
    	}, function(err, result, body) {
    		if (err) {
        		callback(err);
    		} else {
    			console.log(body + " " + result.headers.location);
        		callback(null, result.headers.location);
    		}
    	});		
	}],
	// Create a new githubpublic service instances
	githubpublicInstanceIds: ["toolchainIndex", function(results, callback) {

    	var createServiceInstance = function(repoName, repoUrl, enableIssue, enableTraceability, callbackCreate) {
    		var body = {
    	        "service_id": "githubpublic",
    	        "parameters": {
    				"repo_name": repoName,
    				"repo_url": repoUrl,
    				"type":"link",
    				//"type":"new",
    				"enable_traceability": enableTraceability,
    				"has_issues":enableIssue
    			},
    	        "organization_guid": organization_guid
    	    };
    		
        	
        	request({
        		url : otcApiUrl + "/service_instances",
        		headers : headers,
        		method: "POST",
        		body: body,
        		json: true
        	}, function(err, result, body) {
        		if (err) {
        			callbackCreate(err);
        		} else {
            		console.log("result=" + JSON.stringify(result));
            		console.log("body=" + JSON.stringify(body));
        			console.log("githubpublic service instance created: " + body.instance_id);
        			callbackCreate(null, body.instance_id);
        		}
        	});		    		
    	};
    	async.parallel(_.map(githubRepos, function(githubRepo) {
    		return async.apply(createServiceInstance, githubRepo.repoName, githubRepo.repoUrl, githubRepo.enableIssue, githubRepo.enableTraceability);
    	}), function(err, results) {
    		callback(err, results)
    	});    	
	}],
	// Bind the new githubpublic service instance to the toolchain
	bindGithubToToolchain: ["toolchainLocation", "githubpublicInstanceIds", function(results, callback) {

    	var locationTokens = results.toolchainLocation.split(/[\s\/]+/);
    	//console.log(JSON.stringify(locationTokens));
    	locationTokens.pop();
    	var toolchainId = locationTokens.pop();
    	
    	var body = {};

    	var bindInstance = function(serviceInstanceId, callbackBindInstance) {
        	request({
        		url : otcApiUrl + "/service_instances/" + serviceInstanceId + "/toolchains/" + toolchainId,
        		headers : headers,
        		method: "PUT",
        		body: body,
        		json: true
        	}, function(err, result, body) {
        		if (err) {
        			callbackBindInstance(err);
        		} else {
        			console.log("githubpublic service instance " + serviceInstanceId + " bound to toolchain");
        			callbackBindInstance();
        		}
        	});		    		
    	};
    	
    	async.parallel(_.map(results.githubpublicInstanceIds, function(githubPublicInstanceId) {
    		return async.apply(bindInstance, githubPublicInstanceId);    		
    	}), function(err, results) {
    		callback(err, toolchainId);
    	});
    	
	}],
	// Ensure every git instance is traceability_enabled
	enableTraceability: ["bindGithubToToolchain", function(results, callback) {
    	var enableTraceabilityForInstance = function(serviceInstanceId, callbackEnableTraceabilityInstance) {
        	request({
        		url : otcApiUrl + "/service_instances/" + serviceInstanceId,
        		headers : headers,
        		method: "GET",
        		json: true
        	}, function(err, result, body) {
        		if (err) {
        			callbackEnableTraceabilityInstance(err);
        		} else {
        			if (body.parameters.enable_traceability) {
            			console.log("githubpublic service instance " + serviceInstanceId + " is already traceability enabled");
            			callbackEnableTraceabilityInstance();
        			} else {
            			console.log("githubpublic service instance " + serviceInstanceId + " is not yet traceability enabled");
            			var newServiceInstance = {
            				"service_id": body.service_id,
            				"parameters": body.parameters,
            				"organization_guid": body.organization_guid
            			};

            			newServiceInstance.parameters.enable_traceability = true;
            			
                    	request({
                    		url : otcApiUrl + "/service_instances/" + serviceInstanceId,
                    		headers : headers,
                    		method: "PATCH",
                    		body: newServiceInstance,
                    		json: true
                    	}, function(err, result, body) {
                    		if (err) {
                    			callbackEnableTraceabilityInstance(err);
                    		} else if (result.statusCode == 200) {
                       			console.log("githubpublic service instance " + serviceInstanceId + " is now traceability enabled");
                       			callbackEnableTraceabilityInstance();	
                    		} else {
                    			console.log("Unexpected statusCode for PATCH:" + result.statusCode + " - " + JSON.stringify(result) + " - " + JSON.stringify(body));
                    			callbackEnableTraceabilityInstance({"error": result.statusCode});
                    		}
                    	});
        			}
        		}
        	});		    		
    	};

    	// Wait 5 seconds to have a different enablement time
    	setTimeout(function() {
        	async.parallel(_.map(results.githubpublicInstanceIds, function(githubPublicInstanceId) {
        		return async.apply(enableTraceabilityForInstance, githubPublicInstanceId);    		
        	}), function(err, results) {
        		callback(err);
        	});    		
    	}, 5000);
	}],	
	// Wait some time to ensure webhook is properly defined
	doStuff: ["enableTraceability", function(results, callback) {
		console.log("doing some stuff");
		setTimeout(callback, 5000);
	}],
	// Create a new deployable mapping (simulating the pipeline invocation)
	createDeployableMapping: ["doStuff", function(results, callback) {

    	var toolchainId = results.bindGithubToToolchain;
    	    	
    	var now = new Date().getTime();
    	
    	var body = {
		      "deployable": {
		          "organization_guid": organization_guid,
		          "space_guid": "5f9f2e5f-610c-4013-b34c-84c6bf4ccf30",
		          "region_id": "w3ibm:prod:us-south",
		          "deployable_guid": "6e3bc311-c83d-4cd1-a457-99d9a5f20f19",
		          "type": "app"
		        },
		        "toolchain": {
		          "toolchain_guid": toolchainId,
		          "region_id": "w3ibm:prod:us-south"
		        },
		        "source": {			    	  
			      // reuse of the githubpublic service instance id to overcome some check in otc-api 
		          "source_guid": results.githubpublicInstanceIds[usedRepoGithubIndex],
		          "type": "service_instance"
		        },
		        "experimental": {			        	
			      "inputs": [{ 		    	
			        "service_instance_id": results.githubpublicInstanceIds[usedRepoGithubIndex],
			        "data": {
			            "repo_url": githubRepos[usedRepoGithubIndex].repoUrl,
			            "repo_branch": "master",
			            "timestamp": 123456798,
			            "revision_url": githubRepos[usedRepoGithubIndex].revisionUrl
			        }
			      }],
			      "env": {
						"space_name": "prod_" + now,
						"region_name": "US South",
						"label": "PROD_" + now,
						"org_name": "bluemix_ui_load0303t003@mailinator.com"						
			      }
		        }
		  };
    	    	
    	request({
    		url : otcApiUrl + "/toolchain_deployable_mappings",
    		headers : headers,
    		method: "POST",
    		body: body,
    		json: true
    	}, function(err, result, body) {
    		if (err) {
        		callback(err);
    		} else {
    			console.log(body.message + " " + result.headers.location);
        		callback(null, result.headers.location);
    		}
    	});		
	}],
	doOtherStuff: ["createDeployableMapping", function(results, callback) {
		console.log("doing other stuff");
		setTimeout(callback, 5000);
	}],
	deleteDeployableMapping: ["doOtherStuff", function(results, callback) {
		
		if (results.createDeployableMapping) {
	    	request({
	    		url : results.createDeployableMapping,
	    		headers : headers,
	    		method: "DELETE",
	    		json: true
	    	}, function(err, result, body) {
	    		if (err) {
	    			console.log("Error while deleting deployment mapping:" + err);
	    		} else {
	        		console.log("deployableMapping deleted");
	    		}
	    		callback(err);
	    	});	
		} else {
			callback();
		}
	}],
	unbindGithubpublic: ["deleteDeployableMapping", function(results, callback) {

    	var toolchainId = results.bindGithubToToolchain;

    	var unbindInstance = function(serviceInstanceId, callbackUnbind) {
        	request({
        		url : otcApiUrl + "/service_instances/" + serviceInstanceId + "/toolchains/" + toolchainId,
        		headers : headers,
        		method: "DELETE",
        		json: true
        	}, function(err, result, body) {
        		if (err) {
        			console.log("Error while unbinding:" + err);
        		} else {
            		console.log("githubpublic " + serviceInstanceId + " unbound");
        		}
        		callbackUnbind(err);
        	});
    	};
    	
    	async.parallel(_.map(results.githubpublicInstanceIds, function(githubPublicInstanceId) {
    		return async.apply(unbindInstance, githubPublicInstanceId);    		
    	}), function(err, results) {
    		callback(err, toolchainId);
    	});
    	
	}],
	deleteToolchain: ["unbindGithubpublic", function(results, callback) {

    	request({
    		url : results.toolchainLocation,
    		headers : headers,
    		method: "DELETE",
    		json: true
    	}, function(err, result, body) {
    		if (err) {
    			console.log("Error while deleting toolchain:" + err);
    		} else {
        		console.log("toolchain deleted");
    		}
    		callback(err);
    	});	
	}],
	deleteGithubpublic: ["deleteToolchain", function(results, callback) {
    	
    	var deleteGithubPublic = function(serviceInstanceId, callbackDelete) {
        	request({
        		url : otcApiUrl + "/service_instances/" + serviceInstanceId,
        		headers : headers,
        		method: "DELETE",
        		json: true
        	}, function(err, result, body) {
        		if (err) {
        			console.log("Error while deleting githubpublic instance:" + err);
        		} else {
            		console.log("githubpublic instance" + serviceInstanceId + " deleted");
        		}
        		callbackDelete();
        	});	
    	};
    	
    	async.parallel(_.map(results.githubpublicInstanceIds, function(githubPublicInstanceId) {
    		return async.apply(deleteGithubPublic, githubPublicInstanceId);    		
    	}), function(err, results) {
    		callback(err);
    	});
    	
	}]
}, function (err, result) {
    if (err) {
    	console.log(err);
    }
});

function getAuthenticationToken(username, password, callback) {
	var basicAuth = "";
	var formData = {
			'grant_type' : 'password',
			'username' : username,
			'password' : password
	};
	
	var headers = {
			'Authorization' : 'Basic Y2Y6',
			'Accept' : 'application/json'
	};
	request({
		url : loginUrl,
		headers : headers,
		form : formData,
		method : 'POST'
	}, function(err, result, body) {
		if (err) {
			console.error('User ' + username + ' failed to login to UAA. ' + 'Cause: ', err);
			return callback(err);
		}

		try {
			body = JSON.parse(body);
		} catch (e) {
			return callback(e + " when trying to parse body value of " + body);
		}
		return callback(null, "Bearer " + body.access_token);
	});	
}

//curl -v -i -H "Content-Type: application/json" -H "Authorization: Bearer
//$BEARER" -d @post_toolchain.json http://localhost:3400/api/v1/toolchains

//Recupération de la liste des

