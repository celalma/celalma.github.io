/* engine.js
   This file contains the small runtime glue used by the sandbox iframe.
   The iframe code is generated dynamically by the parent; this file documents
   the message types and provides helpers for future extension.
*/

/*
Message types sent from parent to iframe:
- {type:'init'} : initialize Engine shim
- {type:'runCode', code: '...'} : run user code
- {type:'frame', dt: 0.016} : per-frame update

Message types sent from iframe to parent:
- {type:'ready'} : iframe ready
- {type:'log', args: [...] } : console log
- {type:'error', error: 'message'} : runtime error
- {type:'createSprite', name: '...'} : request to create sprite
- {type:'playSound', name: '...'} : request to play sound
- {type:'setVolume', value: 0.5} : set volume
*/
console.log('engine.js loaded (glue for sandbox).');
