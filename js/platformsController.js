var app = angular.module('platformsApp', []);

app.controller('platformController', ['$scope', 'platformService', 
	function($scope, platformService) {
		$scope.name = 'Someone';
		$scope.source = 'uat-comedy';
		$scope.target = 'testq-nick';
		$scope.platforms = [ ];
		$scope.bundles = [ ];
		$scope.bundleMap = { };
		$scope.loading = false;

		$scope.loadPlatforms = function() {
			$scope.loading = true;
			platformService.loadPlatforms($scope.source)
				.then(function(response) { 
					$scope.platforms = response.data.results; 
					$scope.loading = false;
				});
		};

		$scope.buildBundles = function() {

			var getBundleName = function(pname) {
				var bname = pname;
				var i = pname.indexOf('-no-auth');
				if (i != -1) {
					bname = pname.substr(0, i);
				} else {
					i = pname.indexOf('-noauth');
					if (i != -1) {
						bname = pname.substr(0, i);
					} else {
						i = pname.indexOf('-auth');
						if (i != -1) {
							bname = pname.substr(0, i);
						}
					}
				}
				return bname.substr(0, 1).toUpperCase() + bname.substr(1);
			};

			$scope.loading = true;

			for (var i = 0; i < $scope.platforms.length; i++) {
				var platform = $scope.platforms[i];
				var bname = getBundleName(platform.TypeName);
				var bundle = $scope.bundleMap[bname];
				if (bundle == undefined) {
					bundle = { name: bname, platforms: [ ] };
					$scope.bundles.push(bundle);
					$scope.bundleMap[bname] = bundle;
				}
				bundle.platforms.push(platform);
			};

			$scope.loading = false;
		};

		$scope.checkAll = function(checked) { 
			for (var i = 0; i < $scope.bundles.length; i++) {
				var bundle = $scope.bundles[i];
				bundle.checked = checked;
			}
		};

		$scope.saveBundles = function() {
			var targetPlatforms = {};
			var targetBundles = {};
			var gotPlatforms = false;
			var gotBundles = false;

			var getTargetPlatforms = function() {
				platformService.loadPlatforms($scope.target)
					.then(function(response) {
						targetPlatforms = buildMap(response.data.results);
						gotPlatforms = true;
						continueToSaveBundles();
					});
			};

			var getTargetBundles = function() {
				platformService.loadBundles($scope.target)
					.then(function(response) {
						targetBundles = buildMap(response.data.results);
						gotBundles = true;
						continueToSaveBundles();
					});
			};

			var buildMap = function(list) {
				var map = {};
				for (var i = 0; i < list.length; i++) {
					map[list[i]._title] = list[i];
				}
				return map;
			};

			var continueToSaveBundles = function() {
				// this will be called twice - once for bundles and once for platforms -
				// once both are done, that's when we continue with the rest of the save loop...
				if (gotPlatforms && gotBundles) {
					// for each bundle
					//   if bundle doesn't exist, create bundle with platformtype = app
					//	  else if bundle.platformtype is null, update with platformtype = app
					//   for each platform in bundle
					//     if platform doesn't exist, create platform with bundle, authtype, platformtype (from bundle)
					//     else if platform.bundle != bundle or authtype is null or platformtype is null
					//     	 update platform with bundle, authtype, platformtype (from bundle)
					for (var i = 0; i < $scope.bundles.length; i++) {
						var bundle = $scope.bundles[i];
						if (bundle.checked) {
							saveBundle(bundle);
						}
					}

					$scope.loading = false;
				}
			};

			var saveBundle = function(bundle) {
				var defaultPlatformType = { "_globalId": "{TypeName:app}" };
				var existingBundle = targetBundles[bundle.name];
				if (existingBundle) {
					// if bundle already exists on target, make sure it has PlatformType
					if (!existingBundle.PlatformType) {
						console.log("update existing bundle: " + bundle.name);
						existingBundle.PlatformType = defaultPlatformType;
						platformService.saveRecord($scope.target, existingBundle)
							.then(function(response) {
								//
							},
							function(response) {
								console.log("error updating bundle");
							});
					}
					// we already have bundle uuid so don't have to wait 
					// for bundle to be updated before we save platforms
					saveBundlePlatforms(bundle);

				} else {
					// if bundle doesn't exist on target, construct bundle record and save
					console.log("create new bundle: " + bundle.name);
					var newBundle = {
						"_contentType": "Standard:PlatformBundle", 
						"_namespace": "authorities", 
						"_status": "DEFAULT", 
						"_urlKey": bundle.name.toLowerCase(),
						"TypeName": bundle.name,
						"PlatformType": defaultPlatformType
					};
					platformService.saveRecord($scope.target, newBundle)
						.then(function(response) {
							targetBundles[bundle.name] = response.data;
							saveBundlePlatforms(bundle);
						},
						function(response) {
							console.log("error creating bundle");
						});
				}
			};

			var saveBundlePlatforms = function(bundle) {
				for (var j = 0; j < bundle.platforms.length; j++) {
					var platform = bundle.platforms[j];
					savePlatform(platform, bundle);
				}
			};

			var savePlatform = function(platform, bundle) {
				var dirty = true;
				var authType = getAuthType(platform);
				var existingBundle = targetBundles[bundle.name];
				if (!existingBundle) {
					console.log("can't find bundle: " + bundle.name);
					console.log("not saving platform: " + platform._title);
				}
				var existingPlatform = targetPlatforms[platform.TypeName];
				if (existingPlatform) {
					// if platform already exists on target, 
					// make sure it has PlatformType, AuthType, and PlatformBundle
					var dirty = false;
					if (!existingPlatform.PlatformType) {
						existingPlatform.PlatformType = existingBundle.PlatformType;
						dirty = true;
					}
					if (!existingPlatform.AuthorizationType) {
						existingPlatform.AuthorizationType = { "_globalId": "{TypeName:" + authType + "}" };
						dirty = true;
					}
					if (!existingPlatform.PlatformBundle || existingPlatform.PlatformBundle._title != existingBundle._title) {
						existingPlatform.PlatformBundle = { "_globalId": existingBundle._globalId };
						dirty = true;
					}
					if (dirty) {
						console.log("updating platform: " + platform._title);
						platformService.saveRecord($scope.target, existingPlatform)
							.then(function(response) {
								//
							},
							function(response) {
								console.log("error updating platform");
							});
					}
				} else {
					// if platform doesn't exist on target, save source version onto target
					console.log("creating platform: " + platform._title);
					platform.PlatformType = existingBundle.PlatformType;
					platform.AuthorizationType = { "_globalId": "{TypeName:" + authType + "}" };
					platform.PlatformBundle = { "_globalId": existingBundle._globalId };
					// remove secondary namespaces in case they contain namespaces 
					// that don't exist on target
					delete platform._secondaryNamespaces;
					platformService.saveRecord($scope.target, platform)
						.then(function(response) {
							//
						},
						function(response) {
							console.log("error creating platform");
						});
				}
			};

			var getAuthType = function(platform) {
				var pname = platform._title;
				return (pname.substr(pname.length - 5) == "-auth" ? "auth" : "no-auth");
			};


			// let's get this thing started...
			$scope.loading = true;
			getTargetPlatforms();
			getTargetBundles();
			// continues with continueToSaveBundles()
		};

	}
]);

app.factory('platformService', ['$http', 
	function($http) {
		var service = {};
		
		service.loadPlatforms = function(sitekey) {
			var url = 'http://aapi.mtvnservices.com/aapi/v1/sites/' + sitekey + 
								'/content?contentType=Standard:Platform&summary=false&sort=title&pageSize=1000';
			return $http.get(url); 
		};
		
		service.loadBundles = function(sitekey) {
			var url = 'http://aapi.mtvnservices.com/aapi/v1/sites/' + sitekey + 
								'/content?contentType=Standard:PlatformBundle&summary=false&sort=title&pageSize=1000';
			return $http.get(url);
		};

		service.saveRecord = function(sitekey, record) {
			var url;
			var config = { 
				headers: { 
					'Content-Type': 'application/json',
					'X-Processed-By': 'siessert'
				}};

			if (record._globalId) {
				url = 'http://aapi.mtvnservices.com/aapi/v1/sites/' + sitekey +
							'/content/' + record._globalId;
				return $http.put(url, record, config);
			} else {
				url = 'http://aapi.mtvnservices.com/aapi/v1/sites/' + sitekey + '/content';
				return $http.post(url, record, config);
			}
		};
		
		return service;
	}
]);

