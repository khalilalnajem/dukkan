import {test} from 'node:test'
import assert from 'node:assert/strict'
import {entranceMotion} from '../src/lib/entrance-motion.ts'
test('door motion is clamped, opens before moving forward, then resolves',()=>{
 assert.equal(entranceMotion(-1).phase,'closed')
 assert.equal(entranceMotion(0).angle,0)
 assert.ok(entranceMotion(.4).angle>60)
 assert.equal(entranceMotion(.4).scale,1)
 assert.equal(entranceMotion(.7).angle,108)
 assert.ok(entranceMotion(.8).scale>4)
 assert.equal(entranceMotion(2).phase,'complete')
 assert.equal(entranceMotion(2).fade,0)
})
