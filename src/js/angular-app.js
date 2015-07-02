var angular = require('angular');
var ngRoute = require('angular-route');
var api = require('./api.js');
var R = require('ramda');

var app = angular.module('app', ['ngRoute']);
window.api = api; //NOTE: FOR DEBUGGING

app.config(['$routeProvider', '$locationProvider', '$sceDelegateProvider', function($routeProvider, $locationProvider, $sceDelegateProvider){

  // // whitelist to allow cross domain stuff
  // $sceDelegateProvider.resourceUrlWhitelist([
  //   // Allow same origin resource loads.
  //   'self',
  //   // Allow loading from our assets domain.  Notice the difference between * and **.
  //   'http://*.vevo.com/**'
  // ]);

  $routeProvider.
    when('/', {
        templateUrl: 'views/search.html',
        controller: 'SearchCtrl'
    })
    .when('/stations', {
        templateUrl: 'views/stations.html',
        controller: 'MyStationsCtrl'
    })
    .when('/station/:stationId/:sessionId', {
        templateUrl: 'views/station.html',
        controller: 'StationCtrl'
    })
    .when('/station/:stationId', {
        templateUrl: 'views/station.html',
        controller: 'StationCtrl'
    });

}]);

app.controller('AppCtrl', ['$rootScope', function($rootScope){

  $rootScope.$on('setVideoMode', function(evt, flag){
    console.log("setting video mode", flag);
    $rootScope.videoMode = flag;
  });

}]);

app.controller('SearchCtrl', ['$scope', 'ApiService', 'AppState', '$timeout', '$location', function($scope, apiService, appState, $timeout, $location){

  // region scope functions
  //===============================

  $scope.searching = false;
  $scope.isResetSearch = true;
  $("#search-box").focus();

  $scope.search = function(){
    $scope.searching = true;

    if($scope.searchTerm === ''){
      $scope.searching = false;
      $scope.isResetSearch = true;
      $scope.results = [];
    }else{

      apiService.lookUpArtist($scope.searchTerm)
        .then(function(res){
          console.log(res);
          $timeout(function(){
            $scope.searching = false;
            $scope.isResetSearch = false;
            $scope.results = res;
          });
        });
    }
  }

  //TODO: need to create station here

  $scope.selectArtist = function(index){
    var artist = $scope.results[index];
    appState.artistIdToNameMap[artist.id] = artist.name;

    $scope.creatingStation = true;
    var userId = 'vevo-2';
    apiService.createStationByArtist(userId, [artist.vevo_id])
      .then(function(res){
        $timeout(function(){
          $location.path('/station/' + res.station_id + '/' + res.station_session_id);
        });
      });
  }

  //===============================

}]);

app.controller('StationCtrl', ['$scope', 'ApiService', 'AppState', '$timeout', '$routeParams', '$rootScope', '$location', function($scope, apiService, appState, $timeout, $routeParams, $rootScope, $location){

  // when we're rdy, turn on video mode
  $rootScope.$emit('setVideoMode', true);

  // TODO: get user id
  var userId = 'vevo-2';

  // grab station id from route params
  appState.stationId = $routeParams.stationId;

  // see if it already has a session id, if so use that
  appState.sessionId = $routeParams.sessionId;

  var videoObj = {}; // will contain track and stream info so we can pass to our player

  console.log("session id 1? ", appState.sessionId);

  var tryToGetTrack = function(retries, action){
    if(retries === 0){
        console.log('tryToGetTrack - ' + action);
    }

    if(retries > 5){
      alert('try a different channel, we couldnt get videos from our api :/');
    }else{
      if(retries > 0){
        action = 'error';
      }

      console.log("session id 2? ", appState.sessionId);
      apiService.getTrack(appState.stationId, appState.sessionId, action, { country: 'us' })
        .then(function(track){

            $timeout(function(){
                videoObj.track = track;
            });

            var isrc = track.isrc || track.vevo_id;

            // NOTE: workaround hack here in order to find the correct isrc since musicgraph is returning incorrect isrcs
            return apiService.searchVideo(track);
        }, function(err){
          console.log('error getting track');
        })
        .then(function(searchResults){

            if(searchResults.videos && searchResults.videos.length > 0){
              var video = searchResults.videos[0];
              var isrc = video.isrc;

              // make sure the returned search result actually matches what we are looking for
              if(video.title.toLowerCase() === videoObj.track.title.toLowerCase()){
                return apiService.getStreams(isrc);
              }
            }

            return Promise.reject('couldnt find matching video');

        }, function(err){
          console.log('error searching for video on vevo');
          tryToGetTrack(retries+1, action);
        })
        .then(function(streams){
            var stream = streams[0];
            videoObj.url = stream.url;
            $rootScope.$emit('player:videoObj', videoObj);
        },function(err){
          console.log('error getting streams, retry number: ' + retries);
          tryToGetTrack(retries+1, action);
        });
    }
  }

  if(appState.sessionId){

    tryToGetTrack(0, 'first');

  }else{
    // create new station session with station id and then use the session id to grab the first track
    apiService.createStationSession(appState.stationId, 'us')
      .then(function(session){

        $timeout(function(){
          appState.sessionId = session.station_session_id;
          console.log('creating new session', appState.sessionId);
          tryToGetTrack(0, 'first');
        });

      }, function(err){
        console.log('error creating new session', err);
      });
  }

  // finish current song, go to next
  var playerNext = $rootScope.$on('player:next', function(evt, data){
    tryToGetTrack(0, 'next');
  });

  // skip current song
  var playerSkip = $rootScope.$on('player:skip', function(evt, data){
    tryToGetTrack(0, 'skip');
  });

  // like current song
  var playerLike = $rootScope.$on('player:like', function(evt, data){
    apiService.postFeedback(appState.stationId, appState.sessionId, videoObj.track.id, 'track', 'like');
  });

  // unlike current song
  var playerUnlike = $rootScope.$on('player:unlike', function(evt, data){
    apiService.postFeedback(appState.stationId, appState.sessionId, videoObj.track.id, 'track', 'unlike');
  });

  // show session history
  var playerShowSessionHistory = $rootScope.$on('player:showSessionHistory', function(evt, data){
    apiService.getStationSessionHistory(appState.stationId, appState.sessionId)
      .then(function(res){
        $rootScope.$emit('player:sessionHistoryData', res);
      }, function(err){
        $rootScope.$emit('player:sessionHistoryData', null);
      });
  });

  $scope.$on('$destroy', function(){
    apiService.deleteStationSessionHistory(appState.stationId, appState.sessionId);
    appState.stationId = null;
    appState.sessionId = null;
    $rootScope.$emit('setVideoMode', false);

    // remove rootscope listeners
    playerShowSessionHistory();
    playerUnlike();
    playerLike();
    playerSkip();
    playerNext();
  });

}]);

app.controller('MyStationsCtrl', ['$scope', '$rootScope', 'ApiService', '$timeout', '$location', function($scope, $rootScope, apiService, $timeout, $location){
  console.log('my stations');
  $scope.stations = [];

  var userId = 'vevo-2';
  apiService.getUserStations(userId, { limit: 100 })
    .then(function(stations){
      $timeout(function(){
        $scope.stations = stations;
      });
    });

  $scope.selectStation = function(index){
    var station = $scope.stations[index];
    $location.path('/station/' + station.id);
  };

}]);

// region Services
//===============================

app.factory('ApiService', function(){

  return api;
});

app.factory('AppState', function(){
  var state = {};

  state.artistIdToNameMap = {};

  return state;
});

//===============================



// region Directives
//===============================

app.directive('player', ['$rootScope', '$timeout', '$sce', '$interval', '$location', function($rootScope, $timeout, $sce, $interval, $location){
  return {
    restrict: 'E',
    templateUrl: '/views/directives/player.html',
    link: function($scope, $element, $attr, $ctrl){
      console.log('player directive');
      $scope.videoReady = false;
      $scope.showLoader = false;
      $scope.liked = false;
      $scope.duration = '-';
      $scope.currentTime = '-';
      $scope.showSummary = false;

      $scope.trustSrc = function(src) {
        if(!src){
          return '';
        }

        return $sce.trustAsResourceUrl(src);
      }

      $rootScope.$on('player:videoObj', function(evt, videoObj){
        console.log('got video obj: ', videoObj);
        $timeout(function(){
          //reset states
          $scope.videoReady = true;
          $scope.video = videoObj;
          $scope.showLoader = false;
          $scope.liked = false;

          $scope.duration = getTimeText(videoObj.track.duration);
        });
      });

      $rootScope.$on('setVideoMode', function(evt, flag){

        if(flag === false){
          console.log('stop video player');
          $timeout(function(){
            player.get(0).pause();
            // todo: gradually fade out volume
            $scope.video = {
              track: {
                artist_name: '',
                title: '',
                main_artist_name: ''
              },
              url: ''
            };

            $scope.videoReady = false;
            $scope.showLoader = false;
            $scope.duration = '-';
            $scope.currentTime = '-';
          });
        }else{
          console.log('start video player');
          $timeout(function(){
            $scope.showLoader = true;
          });
        }
      });

      // region event handlers
      //===============================

      $scope.skip = function(){
        console.log('skip video');
        $rootScope.$emit('player:skip');

        $scope.pause();
        $scope.videoReady = false;
        showLoader();
      }

      $scope.like = function(){
        console.log('like video');
        $rootScope.$emit('player:like');

        $timeout(function(){
          $scope.liked = true;
        });
      }

      $scope.unlike = function(){
        console.log('unlike video');
        $rootScope.$emit('player:unlike');

        // if user unlikes, then skip to next video
        $scope.skip();
      }

      $scope.play = function(){
        player.get(0).play();
      }

      $scope.pause = function(){
        player.get(0).pause();
      }

      showLoader = function(){
        $timeout(function(){
          $scope.showLoader = true;
        }, 300);
      }

      $scope.back = function(){

        $scope.video = {
          track: {
            artist_name: '',
            title: '',
            main_artist_name: ''
          }
        };

        $scope.videoReady = false;
        $scope.showLoader = false;
        $scope.duration = '-';
        $scope.currentTime = '-';

        //show summary
        $scope.showSummary = true;
        $scope.pause();
        $rootScope.$emit('player:showSessionHistory');
      }

      $scope.doneWithSummary = function(){
        $location.path('/stations');
        $scope.playedVideos = null;
        $scope.showSummary = false;
      }

      $scope.getActionText = function(action){
        if(action === 'next'){
          return 'watched';
        }else if(action === 'skip'){
          return 'skipped';
        }
      }

      $rootScope.$on('player:sessionHistoryData', function(evt, res){
        console.log("got session history data: ", res);

        $timeout(function(){
          var playedVideos = R.filter(function(item){
              return item.action !== 'error';
          }, res.plays);

          $scope.playedVideos = playedVideos;
        });

      });

      //===============================


      // region Player Event handlers
      //===============================

      var player = $("#player" ,$element);
      player.on('ended', function(e){
        $rootScope.$emit('player:next');

        $scope.videoReady = false;
        showLoader();
      });

      player.on('playing', function(e){
        $timeout(function(){
          $scope.isPlaying = true;
        });
      });

      player.on('pause', function(e){
        $timeout(function(){
          $scope.isPlaying = false;
        });
      });

      player.on('timeupdate', function(e){
        $timeout(function(){
          $scope.currentTime = getTimeText(player.get(0).currentTime);
        });
      });

      //===============================

      var getTimeText = function(timeInSecs){
        timeInSecs = parseInt(+timeInSecs);
        var min = parseInt(timeInSecs / 60);
        var secs = timeInSecs % 60;

        if(secs < 10){
          secs = "0" + secs.toString();
        }
        return min.toString() + ":" + secs;
      }
    }
  };
}]);

//===============================
