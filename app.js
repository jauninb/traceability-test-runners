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

var useJIRA = false;

async.auto({
	// Retrieve authenticationToken
	authenticationToken: function(callback) {
    	getAuthenticationToken(username, password, callback);
	},
	// Retrieve new toolchain index
	toolchainIndex: ["authenticationToken", function(results, callback) {
    	var headers = {
			'Authorization' : results.authenticationToken,
			'Accept' : 'application/json'
    	};
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
    	var headers = {
			'Authorization' : results.authenticationToken,
			'Accept' : 'application/json'
    	};

    	var formData = {
			"name" : "TraceabilityToolchain" + results.toolchainIndex,
			"description" : "A sample toolchain to test traceability",
			"public" : true,
			"organization_guid" : organization_guid,
			"key" : "traceability" + results.toolchainIndex,
			"generator" : "API"
		};
    	
    	request({
    		url : otcApiUrl + "/toolchains",
    		headers : headers,
    		method: "POST",
    		form: formData,
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
	// Create a new githubpublic service instance
	githubpublicInstanceId: ["toolchainIndex", function(results, callback) {
    	var headers = {
			'Authorization' : results.authenticationToken,
			'Accept' : 'application/json'
    	};

    	var body = {
	        "service_id": "githubpublic",
	        "parameters": {
				"repo_name": "traceability-local-test", // + results.toolchainIndex,
				"repo_url":"hhttps://github.com/jauninb/traceability-local-test.git",
				"type":"link",
				//"type":"new",
				"enable_traceability": true,
				"has_issues":"true"
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
        		callback(err);
    		} else {
        		console.log("result=" + JSON.stringify(result));
        		console.log("body=" + JSON.stringify(body));
    			console.log("githubpublic service instance created: " + body.instance_id);
        		callback(null, body.instance_id);
    		}
    	});		
	}],
	// Bind the new githubpublic service instance to the toolchain
	bindGithubToToolchain: ["toolchainLocation", "githubpublicInstanceId", function(results, callback) {
    	var headers = {
			'Authorization' : results.authenticationToken,
			'Accept' : 'application/json'
    	};

    	var locationTokens = results.toolchainLocation.split(/[\s\/]+/);
    	//console.log(JSON.stringify(locationTokens));
    	locationTokens.pop();
    	var toolchainId = locationTokens.pop();
    	
    	var formData = {};
    	
    	request({
    		url : otcApiUrl + "/service_instances/" + results.githubpublicInstanceId + "/toolchains/" + toolchainId,
    		headers : headers,
    		method: "PUT",
    		form: formData,
    		json: true
    	}, function(err, result, body) {
    		if (err) {
        		callback(err);
    		} else {
    			console.log("githubpublic service instance bound to toolchain");
        		callback(null, toolchainId);
    		}
    	});		
	}],
	// Create a new jira service instance
	jiraInstanceId: ["toolchainIndex", function(results, callback) {
		
		if (!useJIRA) {
			return callback();
		}
		
    	var headers = {
			'Authorization' : results.authenticationToken,
			'Accept' : 'application/json'
    	};

    	var formData = {
	        "service_id": "jira",
	        "parameters": {
				"name": "MYFKP",
				"api_url":"https://jauninb.atlassian.net"
			},
	        "organization_guid": organization_guid
	    };
    	
    	request({
    		url : otcApiUrl + "/service_instances",
    		headers : headers,
    		method: "POST",
    		form: formData,
    		json: true
    	}, function(err, result, body) {
    		if (err) {
        		callback(err);
    		} else {
        		console.log("result=" + JSON.stringify(result));
        		console.log("body=" + JSON.stringify(body));
    			console.log("jira instance service instance created: " + body.instance_id);
        		callback(null, body.instance_id);
    		}
    	});		
	}],
	// Bind the new githubpublic service instance to the toolchain
	bindJiraToToolchain: ["toolchainLocation", "jiraInstanceId", function(results, callback) {
		
		if (!useJIRA) {
			return callback();
		}
		
    	var headers = {
			'Authorization' : results.authenticationToken,
			'Accept' : 'application/json'
    	};

    	var locationTokens = results.toolchainLocation.split(/[\s\/]+/);
    	//console.log(JSON.stringify(locationTokens));
    	locationTokens.pop();
    	var toolchainId = locationTokens.pop();
    	
    	var formData = {};
    	
    	request({
    		url : otcApiUrl + "/service_instances/" + results.jiraInstanceId + "/toolchains/" + toolchainId,
    		headers : headers,
    		method: "PUT",
    		form: formData,
    		json: true
    	}, function(err, result, body) {
    		if (err) {
        		callback(err);
    		} else {
    			console.log("jiraInstanceId service instance bound to toolchain");
        		callback(null, toolchainId);
    		}
    	});		
	}],
	// Wait some time to ensure webhook is properly defined
	doStuff: ["bindGithubToToolchain", "bindJiraToToolchain", function(results, callback) {
		console.log("doing some stuff");
		setTimeout(callback, 5000);
	}],
	// Create a new deployable mapping (simulating the pipeline invocation)
	createDeployableMapping: ["doStuff", function(results, callback) {
    	var headers = {
			'Authorization' : results.authenticationToken,
			'Accept' : 'application/json'
    	};

    	var toolchainId = results.bindGithubToToolchain;
    	
    	var formData = {
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
		          "source_guid": results.githubpublicInstanceId,
		          "type": "service_instance"
		        },
		        "experimental": {			        	
			      "inputs": [{ 		    	
			        "service_instance_id": results.githubpublicInstanceId,
			        "data": {
			            "repo_url": "https://github.com/jauninb/traceability.git",
			            "repo_branch": "master",
			            "timestamp": 123456798,
			            "revision_url": "https://github.com/jauninb/traceability/commit/3ada9b458d1e125992d70eba4e73980d5e710423"
			        }
			      }],
			      "env": {
			         "label": "Stagging"
			      }
		        }
		  };
    	
    	console.log(JSON.stringify(formData));
    	
    	request({
    		url : otcApiUrl + "/toolchain_deployable_mappings",
    		headers : headers,
    		method: "POST",
    		form: formData,
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
    	var headers = {
    			'Authorization' : results.authenticationToken,
    			'Accept' : 'application/json'
       	};
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
	}],
	unbindGithubpublic: ["deleteDeployableMapping", function(results, callback) {
    	var headers = {
    			'Authorization' : results.authenticationToken,
    			'Accept' : 'application/json'
       	};
    	var toolchainId = results.bindGithubToToolchain;

    	request({
    		url : otcApiUrl + "/service_instances/" + results.githubpublicInstanceId + "/toolchains/" + toolchainId,
    		headers : headers,
    		method: "DELETE",
    		json: true
    	}, function(err, result, body) {
    		if (err) {
    			console.log("Error while unbinding:" + err);
    		} else {
        		console.log("githubpublic unbound");
    		}
    		callback(err);
    	});	
	}],
	unbindJira: ["deleteDeployableMapping", function(results, callback) {
		
		if (!useJIRA) {
			return callback();
		}
		
    	var headers = {
    			'Authorization' : results.authenticationToken,
    			'Accept' : 'application/json'
       	};
    	var toolchainId = results.bindGithubToToolchain;

    	request({
    		url : otcApiUrl + "/service_instances/" + results.jiraInstanceId + "/toolchains/" + toolchainId,
    		headers : headers,
    		method: "DELETE",
    		json: true
    	}, function(err, result, body) {
    		if (err) {
    			console.log("Error while unbinding:" + err);
    		} else {
        		console.log("jiraInstanceId unbound");
    		}
    		callback(err);
    	});	
	}],
	deleteToolchain: ["unbindGithubpublic", "unbindJira", function(results, callback) {
    	var headers = {
    			'Authorization' : results.authenticationToken,
    			'Accept' : 'application/json'
       	};
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
/*	deleteGithubpublic: ["deleteToolchain", function(results, callback) {
    	var headers = {
    			'Authorization' : results.authenticationToken,
    			'Accept' : 'application/json'
       	};
    	request({
    		url : otcApiUrl + "/service_instances/" + results.githubpublicInstanceId,
    		headers : headers,
    		method: "DELETE",
    		json: true
    	}, function(err, result, body) {
    		if (err) {
    			console.log("Error while deleting githubpublic instance:" + err);
    		} else {
        		console.log("githubpublic instance deleted");
    		}
    		callback(err);
    	});	
	}]	*/
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

