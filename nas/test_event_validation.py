import unittest,copy
from fastapi import HTTPException
from access import validate_event_changes
class EventValidationTest(unittest.TestCase):
 def test_edited_planning_and_lengths(self):
  before={'projects':[{'id':'p','title':'기존'}]}
  for patch in [{'title':'x'*161},{'description':'x'*2001},{'planning':{'startDate':'2026-10-20','endDate':'2026-10-19'}},{'planning':{'budgetMin':200,'budgetMax':100}}]:
   with self.assertRaises(HTTPException):validate_event_changes(before,{'projects':[{'id':'p','title':'기존',**patch}]})
  validate_event_changes(before,{'projects':[{'id':'p','title':'기존','planning':{'budgetMin':0,'budgetMax':100}}]})
 def test_invalid_amount_rejected_without_corrupting_existing(self):
  before={'productions':[{'id':'p','customTabs':[{'id':'t','modules':[{'id':'m','kind':'accounting','rows':[{'id':'r','amount':100}]}]}]}]}
  for value in ['',-1,float('nan'),True,1.234]:
   after=copy.deepcopy(before);after['productions'][0]['customTabs'][0]['modules'][0]['rows'][0]['amount']=value
   with self.assertRaises(HTTPException):validate_event_changes(before,after)
   self.assertEqual(before['productions'][0]['customTabs'][0]['modules'][0]['rows'][0]['amount'],100)
 def test_untouched_legacy_not_blocked(self):
  old={'productions':[{'id':'p','name':'x'*200,'customTabs':[{'id':'t','modules':[{'id':'m','kind':'accounting','rows':[{'id':'r','amount':'legacy'}]}]}]}]}
  validate_event_changes(old,copy.deepcopy(old))
 def test_schedule_only_projection_preserves_hidden_planning(self):
  import sqlite3,json
  from access import merge_workspace,apply_tab_visibility,scope
  db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row;db.execute('CREATE TABLE tab_permissions(owner_id TEXT,tab_id TEXT,policy TEXT)');db.execute('INSERT INTO tab_permissions VALUES(?,?,?)',('p','overview',json.dumps({'advanced':{'view':False,'edit':False}})))
  old={'projects':[],'members':[],'equipment':[],'timetableSchedules':[],'productions':[{'id':'p','name':'행사','memberIds':['mid'],'planningScheduleId':'s','planning':{'startDate':'2026-10-20','endDate':'2026-10-20','risk':'비공개 리스크','budgetMax':1000},'schedules':[{'id':'s','date':'2026-10-20','endDate':'2026-10-20'}]}]}
  actor={'role':'advanced','id':'user','member_id':'mid'};visible=apply_tab_visibility(db,scope(old,actor),actor);self.assertEqual(visible['productions'][0]['planning'],{})
  visible['productions'][0]['schedules'][0]['date']='2026-10-21';visible['productions'][0]['schedules'][0]['endDate']='2026-10-21';visible['productions'][0]['planning']={'startDate':'2026-10-21','endDate':'2026-10-21','location':''}
  saved=merge_workspace(db,old,visible,actor);self.assertEqual(saved['productions'][0]['planning']['risk'],'비공개 리스크');self.assertEqual(saved['productions'][0]['planning']['budgetMax'],1000)
  visible['productions'][0]['planning']['budgetMax']=0
  with self.assertRaises(HTTPException):merge_workspace(db,old,visible,actor)
